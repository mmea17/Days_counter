import { getDb, ensureTables } from './db';
import { events } from './db/schema';
import { sendUserPushNotifications } from './lib/push';
import { eq } from 'drizzle-orm';

export interface Env {
  DB: D1Database;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

export default {
  async scheduled(event: any, env: Env, ctx: any): Promise<void> {
    console.log(`[Cron Trigger] Executing scheduled notification check at ${new Date().toISOString()}...`);

    if (!env?.DB) {
      console.warn('[Cron Trigger] No D1 Database binding found.');
      return;
    }

    try {
      await ensureTables(env.DB);
      const db = getDb(env.DB);
      const allEvents = await db.select().from(events);
      const now = new Date();
      let sentCount = 0;

      for (const ev of allEvents) {
        const target = new Date(ev.targetDate);
        const diffMs = target.getTime() - now.getTime();
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        let shouldNotify = false;
        let notificationBody = '';

        switch (ev.reminderPreset) {
          case 'at_time':
            if (diffMinutes <= 15 && diffMinutes >= -15) {
              shouldNotify = true;
              notificationBody = `حان الآن موعد: ${ev.title}!`;
            }
            break;

          case '1_hour_before':
            if (diffHours <= 1 && diffHours >= 0) {
              shouldNotify = true;
              notificationBody = `متبقي ساعة واحدة فقط على موعد: ${ev.title}`;
            }
            break;

          case '1_day_before':
            if (diffDays <= 1 && diffDays >= 0) {
              shouldNotify = true;
              notificationBody = `متبقي يوم واحد فقط على موعد: ${ev.title}`;
            }
            break;

          case '3_days_before':
            if (diffDays <= 3 && diffDays >= 0) {
              shouldNotify = true;
              notificationBody = `متبقي 3 أيام على موعد: ${ev.title}`;
            }
            break;

          case '1_week_before':
            if (diffDays <= 7 && diffDays >= 0) {
              shouldNotify = true;
              notificationBody = `متبقي أسبوع واحد على موعد: ${ev.title}`;
            }
            break;
        }

        // Recurrence logic
        if (!shouldNotify && ev.recurrence && ev.recurrence !== 'none') {
          const lastNotified = ev.lastNotifiedAt ? new Date(ev.lastNotifiedAt).getTime() : 0;
          const hoursSinceLast = (now.getTime() - lastNotified) / (1000 * 60 * 60);

          if (ev.recurrence === 'daily' && hoursSinceLast >= 24) {
            shouldNotify = true;
            notificationBody = diffMs > 0
              ? `تنبيه يومي: متبقي ${diffDays} يوم على ${ev.title}`
              : `تنبيه يومي: مضى ${Math.abs(diffDays)} يوم على ${ev.title}`;
          } else if (ev.recurrence === 'weekly' && hoursSinceLast >= 24 * 7) {
            shouldNotify = true;
            notificationBody = diffMs > 0
              ? `تنبيه أسبوعي: متبقي ${diffDays} يوم على ${ev.title}`
              : `تنبيه أسبوعي: مضى ${Math.abs(diffDays)} يوم على ${ev.title}`;
          }
        }

        // Throttle check
        if (shouldNotify && ev.lastNotifiedAt) {
          const hours = (now.getTime() - new Date(ev.lastNotifiedAt).getTime()) / (1000 * 60 * 60);
          if (hours < 6) shouldNotify = false;
        }

        if (shouldNotify) {
          const res = await sendUserPushNotifications(
            env.DB,
            ev.userId,
            {
              title: `⏰ تذكير بمناسبة: ${ev.title}`,
              body: notificationBody,
              data: { url: '/dashboard', eventId: ev.id },
            },
            env
          );

          if (res.sent > 0) {
            sentCount += res.sent;
            await db
              .update(events)
              .set({ lastNotifiedAt: now.toISOString() })
              .where(eq(events.id, ev.id));
          }
        }
      }

      console.log(`[Cron Trigger] Notification check finished. Dispatched ${sentCount} notifications.`);
    } catch (err) {
      console.error('[Cron Trigger] Notification dispatcher failed:', err);
    }
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    return new Response('Days Counter Scheduled Worker is active', { status: 200 });
  },
};
