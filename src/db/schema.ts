import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  salt: text('salt').notNull(),
  createdAt: text('created_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  targetDate: text('target_date').notNull(), // ISO string YYYY-MM-DDTHH:mm
  category: text('category').notNull().default('general'), // general, personal, work, study, travel, anniversary
  color: text('color').notNull().default('emerald'), // emerald, sky, violet, amber, rose, indigo
  reminderPreset: text('reminder_preset').notNull().default('1_day_before'), // none, at_time, 1_hour_before, 1_day_before, 3_days_before, 1_week_before
  recurrence: text('recurrence').notNull().default('none'), // none, daily, weekly, monthly, yearly
  displayUnits: text('display_units').notNull().default('days'), // e.g. "days", "weeks,days", "years,months,days", "years,months,weeks,days"
  lastNotifiedAt: text('last_notified_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: text('created_at').notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type EventItem = typeof events.$inferSelect;
export type NewEventItem = typeof events.$inferInsert;
export type PushSubscriptionRecord = typeof pushSubscriptions.$inferSelect;
