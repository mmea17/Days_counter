import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { getDb, ensureTables } from '../db';
import { users, events, pushSubscriptions, sessions } from '../db/schema';
import {
  hashPassword,
  verifyPassword,
  createSession,
  getUserFromSession,
  deleteSession,
} from '../lib/auth';
import {
  DEFAULT_VAPID_PUBLIC_KEY,
  sendPushNotification,
  sendUserPushNotifications,
  getVapidDetails,
} from '../lib/push';
import { calculateDateDifference, type WeekendMode } from '../lib/dateCalculator';
import { eq, and, desc, asc } from 'drizzle-orm';

export interface EnvBindings {
  DB: D1Database;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

export const app = new Hono<{ Bindings: EnvBindings }>();

// Enable CORS for all routes
app.use('*', cors({
  origin: (origin) => origin || '*',
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}));

// Middleware to extract user from session cookie
app.use('*', async (c, next) => {
  if (c.env?.DB) {
    await ensureTables(c.env.DB);
    const sessionId = getCookie(c, 'days_counter_session');
    if (sessionId) {
      const user = await getUserFromSession(c.env.DB, sessionId);
      if (user) {
        c.set('user' as never, user as never);
      }
    }
  }
  await next();
});

// Helper auth guard
function requireAuth(c: any) {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'غير مصرح. يرجى تسجيل الدخول أولاً' }, 401);
  }
  return null;
}

/* ==========================================================================
   AUTH ROUTES
   ========================================================================== */

// Register
app.post('/api/auth/register', async (c) => {
  try {
    const { name, email, password } = await c.req.json();

    if (!name || !email || !password) {
      return c.json({ error: 'جميع الحقول مطلوبة (الاسم، البريد، كلمة المرور)' }, 400);
    }

    if (password.length < 6) {
      return c.json({ error: 'كلمة المرور يجب أن لا تقل عن 6 أحرف' }, 400);
    }

    const db = getDb(c.env.DB);
    const normalizedEmail = email.toLowerCase().trim();

    // Check existing email
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      return c.json({ error: 'البريد الإلكتروني مسجل بالفعل' }, 409);
    }

    const { hash, salt } = await hashPassword(password);
    const userId = crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: hash,
      salt: salt,
      createdAt: new Date().toISOString(),
    });

    // Create session
    const sessionId = await createSession(c.env.DB, userId);
    const isHttps = c.req.url.startsWith('https');
    setCookie(c, 'days_counter_session', sessionId, {
      path: '/',
      httpOnly: true,
      secure: isHttps,
      sameSite: 'Lax',
      maxAge: 30 * 24 * 60 * 60,
    });

    return c.json({
      success: true,
      user: { id: userId, name: name.trim(), email: normalizedEmail },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return c.json({ error: 'حدث خطأ أثناء إنشاء الحساب: ' + (error?.message || 'خطأ غير معروف') }, 500);
  }
});

// Login
app.post('/api/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' }, 400);
    }

    const db = getDb(c.env.DB);
    const normalizedEmail = email.toLowerCase().trim();

    const userList = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (userList.length === 0) {
      return c.json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }, 401);
    }

    const user = userList[0];
    const isMatch = await verifyPassword(password, user.passwordHash, user.salt);

    if (!isMatch) {
      return c.json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }, 401);
    }

    // Create session
    const sessionId = await createSession(c.env.DB, user.id);
    const isHttps = c.req.url.startsWith('https');
    setCookie(c, 'days_counter_session', sessionId, {
      path: '/',
      httpOnly: true,
      secure: isHttps,
      sameSite: 'Lax',
      maxAge: 30 * 24 * 60 * 60,
    });

    return c.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return c.json({ error: 'حدث خطأ أثناء تسجيل الدخول' }, 500);
  }
});

// Logout
app.post('/api/auth/logout', async (c) => {
  try {
    const sessionId = getCookie(c, 'days_counter_session');
    if (sessionId && c.env?.DB) {
      await deleteSession(c.env.DB, sessionId);
    }
    deleteCookie(c, 'days_counter_session', { path: '/' });
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: true });
  }
});

// Current User
app.get('/api/auth/me', (c) => {
  const user = (c.get as any)('user');
  if (!user) {
    return c.json({ user: null }, 401);
  }
  return c.json({
    user: { id: user.id, name: user.name, email: user.email },
  });
});

/* ==========================================================================
   EVENTS CRUD ROUTES
   ========================================================================== */

// Get all events for the logged-in user
app.get('/api/events', async (c) => {
  const unauth = requireAuth(c);
  if (unauth) return unauth;
  const user = (c.get as any)('user');

  try {
    const db = getDb(c.env.DB);
    const category = c.req.query('category');

    let query = db
      .select()
      .from(events)
      .where(eq(events.userId, user.id));

    const userEvents = await query;

    // Sort by targetDate ascending
    userEvents.sort((a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime());

    return c.json({ events: userEvents });
  } catch (error: any) {
    console.error('Error fetching events:', error);
    return c.json({ error: 'تعذر جلب الأحداث' }, 500);
  }
});

// Create new event
app.post('/api/events', async (c) => {
  const unauth = requireAuth(c);
  if (unauth) return unauth;
  const user = (c.get as any)('user');

  try {
    const body = await c.req.json();
    const {
      title,
      description,
      targetDate,
      category = 'general',
      color = 'emerald',
      reminderPreset = '1_day_before',
      recurrence = 'none',
    } = body;

    if (!title || !targetDate) {
      return c.json({ error: 'عنوان الحدث والتاريخ والوقت حقول مطلوبة' }, 400);
    }

    const db = getDb(c.env.DB);
    const now = new Date().toISOString();
    const eventId = crypto.randomUUID();

    const newEvent = {
      id: eventId,
      userId: user.id,
      title: title.trim(),
      description: description ? description.trim() : null,
      targetDate: targetDate,
      category,
      color,
      reminderPreset,
      recurrence,
      lastNotifiedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(events).values(newEvent);

    return c.json({ success: true, event: newEvent }, 201);
  } catch (error: any) {
    console.error('Error creating event:', error);
    return c.json({ error: 'تعذر إنشاء الحدث' }, 500);
  }
});

// Update event
app.put('/api/events/:id', async (c) => {
  const unauth = requireAuth(c);
  if (unauth) return unauth;
  const user = (c.get as any)('user');
  const eventId = c.req.param('id');

  try {
    const body = await c.req.json();
    const {
      title,
      description,
      targetDate,
      category,
      color,
      reminderPreset,
      recurrence,
    } = body;

    const db = getDb(c.env.DB);
    const existing = await db
      .select()
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.userId, user.id)))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: 'الحدث غير موجود أو غير مصرح بتعديله' }, 404);
    }

    const updates: Partial<typeof events.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description ? description.trim() : null;
    if (targetDate !== undefined) updates.targetDate = targetDate;
    if (category !== undefined) updates.category = category;
    if (color !== undefined) updates.color = color;
    if (reminderPreset !== undefined) updates.reminderPreset = reminderPreset;
    if (recurrence !== undefined) updates.recurrence = recurrence;

    await db.update(events).set(updates).where(eq(events.id, eventId));

    const updated = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    return c.json({ success: true, event: updated[0] });
  } catch (error: any) {
    console.error('Error updating event:', error);
    return c.json({ error: 'تعذر تعديل الحدث' }, 500);
  }
});

// Delete event
app.delete('/api/events/:id', async (c) => {
  const unauth = requireAuth(c);
  if (unauth) return unauth;
  const user = (c.get as any)('user');
  const eventId = c.req.param('id');

  try {
    const db = getDb(c.env.DB);
    const result = await db
      .delete(events)
      .where(and(eq(events.id, eventId), eq(events.userId, user.id)));

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting event:', error);
    return c.json({ error: 'تعذر حذف الحدث' }, 500);
  }
});

/* ==========================================================================
   PUSH NOTIFICATIONS ROUTES
   ========================================================================== */

// Get VAPID public key
app.get('/api/push/vapid-public-key', (c) => {
  const { publicKey } = getVapidDetails(c.env);
  return c.json({ publicKey });
});

// Subscribe device to push notifications
app.post('/api/push/subscribe', async (c) => {
  const unauth = requireAuth(c);
  if (unauth) return unauth;
  const user = (c.get as any)('user');

  try {
    const { endpoint, keys, userAgent } = await c.req.json();

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return c.json({ error: 'بيانات الاشتراك غير مكتملة' }, 400);
    }

    const db = getDb(c.env.DB);

    // Delete any existing subscription with same endpoint to avoid duplicates
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));

    // Insert new subscription
    await db.insert(pushSubscriptions).values({
      id: crypto.randomUUID(),
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent || null,
      createdAt: new Date().toISOString(),
    });

    return c.json({ success: true, message: 'تم تفعيل الإشعارات بنجاح' });
  } catch (error: any) {
    console.error('Error saving subscription:', error);
    return c.json({ error: 'تعذر حفظ بيانات اشتراك الإشعارات' }, 500);
  }
});

// Unsubscribe device
app.post('/api/push/unsubscribe', async (c) => {
  const unauth = requireAuth(c);
  if (unauth) return unauth;

  try {
    const { endpoint } = await c.req.json();
    if (endpoint) {
      const db = getDb(c.env.DB);
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint));
    }
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: true });
  }
});

// Send test notification to user's registered devices
app.post('/api/push/test', async (c) => {
  const unauth = requireAuth(c);
  if (unauth) return unauth;
  const user = (c.get as any)('user');

  try {
    const result = await sendUserPushNotifications(
      c.env.DB,
      user.id,
      {
        title: '🔔 تجربة الإشعارات - عداد الأيام',
        body: `مرحباً ${user.name}! تم تفعيل الإشعارات بنجاح على هذا الجهاز.`,
        data: { url: '/dashboard' },
      },
      c.env
    );

    return c.json({
      success: true,
      message: `تم إرسال إشعار التجربة بنجاح إلى (${result.sent}) جهاز.`,
      result,
    });
  } catch (error: any) {
    console.error('Error sending test push:', error);
    return c.json({ error: 'تعذر إرسال إشعار التجربة' }, 500);
  }
});

/* ==========================================================================
   CRON TRIGGER / SCHEDULED NOTIFICATIONS DISPATCHER
   ========================================================================== */

app.all('/api/cron/check-notifications', async (c) => {
  try {
    const db = getDb(c.env.DB);
    const allEvents = await db.select().from(events);
    const now = new Date();
    let sentCount = 0;
    let checkedCount = 0;

    for (const ev of allEvents) {
      checkedCount++;
      const target = new Date(ev.targetDate);
      const diffMs = target.getTime() - now.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      let shouldNotify = false;
      let notificationBody = '';

      // Check reminder preset rules
      switch (ev.reminderPreset) {
        case 'at_time':
          // Within 15 minutes of event start or exact time
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

      // Check recurrence rules if enabled
      if (!shouldNotify && ev.recurrence && ev.recurrence !== 'none') {
        const lastNotified = ev.lastNotifiedAt ? new Date(ev.lastNotifiedAt).getTime() : 0;
        const hoursSinceLastNotification = (now.getTime() - lastNotified) / (1000 * 60 * 60);

        if (ev.recurrence === 'daily' && hoursSinceLastNotification >= 24) {
          shouldNotify = true;
          notificationBody = diffMs > 0
            ? `تنبيه يومي: متبقي ${diffDays} يوم على ${ev.title}`
            : `تنبيه يومي: مضى ${Math.abs(diffDays)} يوم على ${ev.title}`;
        } else if (ev.recurrence === 'weekly' && hoursSinceLastNotification >= 24 * 7) {
          shouldNotify = true;
          notificationBody = diffMs > 0
            ? `تنبيه أسبوعي: متبقي ${diffDays} يوم على ${ev.title}`
            : `تنبيه أسبوعي: مضى ${Math.abs(diffDays)} يوم على ${ev.title}`;
        }
      }

      // Prevent spamming if already notified within the last 6 hours for same reminder
      if (shouldNotify && ev.lastNotifiedAt) {
        const hoursSinceNotified = (now.getTime() - new Date(ev.lastNotifiedAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceNotified < 6) {
          shouldNotify = false;
        }
      }

      if (shouldNotify) {
        const result = await sendUserPushNotifications(
          c.env.DB,
          ev.userId,
          {
            title: `⏰ تذكير: ${ev.title}`,
            body: notificationBody,
            data: { url: '/dashboard', eventId: ev.id },
          },
          c.env
        );

        if (result.sent > 0) {
          sentCount += result.sent;
          await db
            .update(events)
            .set({ lastNotifiedAt: now.toISOString() })
            .where(eq(events.id, ev.id));
        }
      }
    }

    return c.json({
      success: true,
      timestamp: now.toISOString(),
      checkedCount,
      sentCount,
    });
  } catch (error: any) {
    console.error('Error running cron notifications check:', error);
    return c.json({ error: 'خطأ في معالجة الإشعارات المجدولة' }, 500);
  }
});

/* ==========================================================================
   DATE CALCULATOR API
   ========================================================================== */

app.post('/api/calculator/diff', async (c) => {
  try {
    const { startDate, endDate, weekendMode = 'friday_saturday' } = await c.req.json();

    if (!startDate || !endDate) {
      return c.json({ error: 'تاريخ البداية وتاريخ النهاية مطلوبان' }, 400);
    }

    const diff = calculateDateDifference(
      startDate,
      endDate,
      weekendMode as WeekendMode
    );

    return c.json({ success: true, result: diff });
  } catch (error: any) {
    return c.json({ error: 'حدث خطأ أثناء حساب الفارق الزمني' }, 500);
  }
});
