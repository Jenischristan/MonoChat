import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Context, Next } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { sessions, users, userSettings } from '../db/schema';
import { generateId, generateSessionToken } from './ids';
import type { User, UserSettings } from '../../src/types/messaging';

export type AppEnv = {
  Variables: {
    user: User;
    sessionToken: string;
    sessionId: string;
  };
};

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, keyHex] = storedHash.split(':');
    if (!salt || !keyHex) return false;
    const keyBuffer = Buffer.from(keyHex, 'hex');
    const derivedBuffer = scryptSync(password, salt, 64);
    if (keyBuffer.length !== derivedBuffer.length) return false;
    return timingSafeEqual(keyBuffer, derivedBuffer);
  } catch {
    return false;
  }
}

export function sanitizeText(input: unknown, maxLength = 4000): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLength);
}

export function hydrateSettings(row: Record<string, any> | null | undefined): UserSettings {
  return {
    theme: (row?.theme as UserSettings['theme']) || 'dark',
    notificationsEnabled: row ? Boolean(row.notificationsEnabled) : true,
    soundEnabled: row ? Boolean(row.soundEnabled) : true,
    desktopNotifications: row ? Boolean(row.desktopNotifications) : false,
    showReadReceipts: row ? Boolean(row.showReadReceipts) : true,
    showOnlineStatus: row ? Boolean(row.showOnlineStatus) : true,
    showTypingIndicator: row ? Boolean(row.showTypingIndicator) : true,
    enterToSend: row?.enterToSend !== undefined ? Boolean(row.enterToSend) : true,
    messagePreview: row?.messagePreview !== undefined ? Boolean(row.messagePreview) : true,
    compactMode: row?.compactMode !== undefined ? Boolean(row.compactMode) : false,
    fontSize: (row?.fontSize as UserSettings['fontSize']) || 'medium',
    allowDirectMessages: (row?.allowDirectMessages as UserSettings['allowDirectMessages']) || 'everyone',
    chatWallpaper: String(row?.chatWallpaper || 'solid-obsidian'),
  };
}

export function hydrateUser(row: Record<string, any>, settings?: Record<string, any> | null): User {
  return {
    id: String(row.id),
    username: String(row.username),
    email: String(row.email),
    displayName: String(row.displayName),
    avatarUrl: row.avatarUrl ? String(row.avatarUrl) : null,
    bio: String(row.bio || ''),
    statusText: String(row.statusText || 'Available'),
    phone: String(row.phone || ''),
    pronouns: String(row.pronouns || ''),
    title: String(row.title || ''),
    location: String(row.location || ''),
    website: String(row.website || ''),
    isOnline: Boolean(row.isOnline),
    lastSeenAt: String(row.lastSeenAt),
    createdAt: String(row.createdAt),
    ...(settings !== undefined ? { settings: hydrateSettings(settings) } : {}),
  };
}

export async function getSettingsRow(userId: string) {
  const db = getDb();
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return rows[0] || null;
}

export async function getUserFromToken(
  token: string | undefined | null,
): Promise<{ user: User; sessionId: string } | null> {
  if (!token) return null;
  const db = getDb();
  const now = new Date().toISOString();

  const rows = await db
    .select({ session: sessions, user: users, settings: userSettings })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(userSettings, eq(userSettings.userId, sessions.userId))
    .where(eq(sessions.token, token))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt < now) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id));
    return null;
  }

  return {
    user: hydrateUser(row.user, row.settings),
    sessionId: row.session.id,
  };
}

export function extractBearerToken(c: Context): string | null {
  const authHeader = c.req.header('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const queryToken = c.req.query('token');
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim();
  }
  return null;
}

export async function getUserById(userId: string, includeSettings = true): Promise<User | null> {
  const db = getDb();
  const rows = await db
    .select({ user: users, settings: userSettings })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!rows[0]) return null;
  return hydrateUser(rows[0].user, includeSettings ? rows[0].settings : undefined);
}

export async function createSessionForUser(userId: string, c: Context): Promise<string> {
  const db = getDb();
  const sessionId = generateId('sess');
  const token = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const userAgent = sanitizeText(c.req.header('user-agent') || 'Web Client', 200);

  await db.insert(sessions).values({
    id: sessionId,
    token,
    userId,
    userAgent,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    lastActiveAt: now.toISOString(),
  });

  return token;
}

/** Hono middleware: authenticates the request and populates c.var.user */
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const token = extractBearerToken(c);
  if (!token) {
    return c.json({ error: 'Authentication required. Please sign in.' }, 401);
  }

  const sessionData = await getUserFromToken(token);
  if (!sessionData) {
    return c.json({ error: 'Session expired or invalid. Please sign in again.' }, 401);
  }

  c.set('user', sessionData.user);
  c.set('sessionToken', token);
  c.set('sessionId', sessionData.sessionId);
  await next();
}

// Simple in-memory rate limiter per IP + endpoint category
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function createRateLimiter(maxRequests: number, windowMs: number) {
  return async (c: Context, next: Next) => {
    const ip =
      c.req.header('x-real-ip') ||
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
      'local';
    const key = `${ip}:${new URL(c.req.url).pathname.split('/')[2] || 'root'}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    if (bucket.count >= maxRequests) {
      return c.json(
        { error: 'Too many requests. Please wait a moment before trying again.' },
        429,
      );
    }

    bucket.count += 1;
    await next();
  };
}

export async function touchSession(sessionId: string) {
  const db = getDb();
  await db
    .update(sessions)
    .set({ lastActiveAt: new Date().toISOString() })
    .where(and(eq(sessions.id, sessionId), sql`true`));
}
