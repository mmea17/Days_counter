import webpush from 'web-push';
import { getDb } from '../db';
import { pushSubscriptions } from '../db/schema';
import { eq } from 'drizzle-orm';

export const DEFAULT_VAPID_PUBLIC_KEY =
  'BPQ5idLxkztgeXcrsP4EGORCYSkl5uad6rv6so5h_g8jtTcNFq9WzExkBbFI3J_x7k2thGn2LYAeZLm3B3zSFas';
export const DEFAULT_VAPID_PRIVATE_KEY =
  'Mb1PwQTpGZXthXQ8SqFyMAnKMQ2npHLWuMQvOxtpjzM';
export const DEFAULT_VAPID_SUBJECT = 'mailto:admin@dayscounter.app';

export function getVapidDetails(env?: Record<string, any>) {
  const publicKey = (env && env.VAPID_PUBLIC_KEY) || DEFAULT_VAPID_PUBLIC_KEY;
  const privateKey = (env && env.VAPID_PRIVATE_KEY) || DEFAULT_VAPID_PRIVATE_KEY;
  const subject = (env && env.VAPID_SUBJECT) || DEFAULT_VAPID_SUBJECT;

  webpush.setVapidDetails(subject, publicKey, privateKey);

  return { publicKey, privateKey, subject };
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: {
    url?: string;
    eventId?: string;
  };
}

export async function sendPushNotification(
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: PushPayload,
  env?: Record<string, any>
): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    getVapidDetails(env);

    const pushConfig = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    const res = await webpush.sendNotification(
      pushConfig,
      JSON.stringify(payload),
      {
        TTL: 60 * 60 * 24, // 24 hours
      }
    );

    return { success: true, status: res.statusCode };
  } catch (error: any) {
    console.error('Failed to send push notification:', error?.statusCode || error?.message);
    return {
      success: false,
      status: error?.statusCode,
      error: error?.message || 'Push error',
    };
  }
}

export async function sendUserPushNotifications(
  d1: D1Database,
  userId: string,
  payload: PushPayload,
  env?: Record<string, any>
): Promise<{ sent: number; failed: number }> {
  const db = getDb(d1);
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    const result = await sendPushNotification(
      {
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
      payload,
      env
    );

    if (result.success) {
      sent++;
    } else {
      failed++;
      // If endpoint is expired or invalid (404 or 410), clean it up from D1
      if (result.status === 404 || result.status === 410) {
        try {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, sub.id));
        } catch (e) {
          console.error('Failed to clean up stale subscription:', e);
        }
      }
    }
  }

  return { sent, failed };
}
