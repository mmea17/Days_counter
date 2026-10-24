import { getDb, ensureTables } from '../db';
import { users, sessions, type User } from '../db/schema';
import { eq } from 'drizzle-orm';

const ITERATIONS = 100000;
const KEYLEN = 32;

// Hash password with salt using WebCrypto PBKDF2
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = Array.from(saltBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEYLEN * 8
  );

  const hash = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return { hash, salt };
}

// Verify password against stored hash and salt
export async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
  const saltBytes = new Uint8Array(
    storedSalt.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEYLEN * 8
  );

  const hash = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return hash === storedHash;
}

// Generate random ID (UUID-like)
export function generateId(): string {
  return crypto.randomUUID();
}

// Create a session for a user (valid for 30 days)
export async function createSession(d1: D1Database, userId: string): Promise<string> {
  await ensureTables(d1);
  const db = getDb(d1);
  const sessionId = crypto.randomUUID();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const expiresAt = Date.now() + thirtyDaysMs;

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
    createdAt: new Date().toISOString(),
  });

  return sessionId;
}

// Get user from session ID
export async function getUserFromSession(d1: D1Database, sessionId?: string | null): Promise<User | null> {
  if (!sessionId) return null;
  try {
    await ensureTables(d1);
    const db = getDb(d1);
    const sessionList = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (sessionList.length === 0) return null;

    const session = sessionList[0];
    if (session.expiresAt < Date.now()) {
      // Session expired, remove it
      await db.delete(sessions).where(eq(sessions.id, sessionId));
      return null;
    }

    const userList = await db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    return userList[0] || null;
  } catch (err) {
    console.error('Error fetching user from session:', err);
    return null;
  }
}

// Invalidate a session
export async function deleteSession(d1: D1Database, sessionId: string): Promise<void> {
  try {
    const db = getDb(d1);
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  } catch (err) {
    console.error('Error deleting session:', err);
  }
}
