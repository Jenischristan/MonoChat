import { Hono } from 'hono';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
  conversations,
  conversationMembers,
  passwordResets,
  sessions,
  userSettings,
  users,
} from '../db/schema';
import {
  createSessionForUser,
  createRateLimiter,
  hashPassword,
  hydrateUser,
  requireAuth,
  sanitizeText,
  verifyPassword,
  type AppEnv,
} from '../lib/auth';
import { generateId, generateSessionToken } from '../lib/ids';
import { zodErrorToMessage } from '../lib/validation';

export const authApp = new Hono<AppEnv>();
const authRateLimiter = createRateLimiter(300, 60_000);

const validWallpapers = [
  'solid-obsidian',
  'solid-dark',
  'midnight-peaks',
  'obsidian-dunes',
  'noir-forest',
  'eclipse-horizon',
];

authApp.get('/status', async (c) => {
  const db = getDb();
  const rows = await db.select({ cnt: sql<number>`count(*)::int` }).from(users);
  return c.json({ hasUsers: Number(rows[0]?.cnt || 0) > 0 });
});

authApp.get('/check-username', async (c) => {
  const raw = sanitizeText(c.req.query('username'), 30)
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_.-]/g, '');
  if (!raw || raw.length < 2) {
    return c.json({ available: false, reason: 'Min 2 chars' });
  }
  const taken = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(sql`LOWER(${users.username}) = ${raw}`)
    .limit(1);
  return c.json({ available: taken.length === 0, username: raw });
});

const registerSchema = z.object({
  username: z.string().max(30).optional().nullable(),
  displayName: z.string().max(60).optional().nullable(),
  email: z.string().max(120).optional().nullable(),
  password: z.string().optional(),
  bio: z.string().max(240).optional().nullable(),
  statusText: z.string().max(80).optional().nullable(),
  title: z.string().max(80).optional().nullable(),
  pronouns: z.string().max(40).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  avatarUrl: z.string().max(150000).optional().nullable(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  chatWallpaper: z.string().optional().nullable(),
  allowDirectMessages: z.enum(['everyone', 'contacts']).optional(),
  showOnlineStatus: z.boolean().optional(),
  showReadReceipts: z.boolean().optional(),
  showTypingIndicator: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
});

authApp.post('/register', authRateLimiter, async (c) => {
  try {
    const parsed = registerSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: zodErrorToMessage(parsed.error) }, 400);
    }
    const body = parsed.data;

    const rawUsername = sanitizeText(body.username, 30)
      .toLowerCase()
      .replace(/^@+/, '')
      .replace(/[^a-z0-9_.-]/g, '');
    const displayName = sanitizeText(body.displayName || rawUsername, 60);
    const username =
      rawUsername ||
      displayName
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, '')
        .slice(0, 24) ||
      `user_${Math.random().toString(36).slice(2, 7)}`;
    const rawEmail = sanitizeText(body.email, 120).toLowerCase();
    const email = rawEmail && rawEmail.includes('@') ? rawEmail : `${username}@monochat.local`;
    const password = typeof body.password === 'string' ? body.password : '';
    const bio = sanitizeText(body.bio, 240);
    const statusText = sanitizeText(body.statusText, 80) || 'Available';
    const title = sanitizeText(body.title, 80);
    const pronouns = sanitizeText(body.pronouns, 40);
    const phone = sanitizeText(body.phone, 40);
    const avatarUrl =
      typeof body.avatarUrl === 'string' && body.avatarUrl.trim()
        ? body.avatarUrl.trim().slice(0, 150000)
        : null;

    if (username.length < 2) {
      return c.json({ error: 'Username must be at least 2 characters.' }, 400);
    }
    if (!displayName || displayName.length < 2) {
      return c.json({ error: 'Display name must be at least 2 characters.' }, 400);
    }
    if (password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters long.' }, 400);
    }

    const db = getDb();

    const existingUsername = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`LOWER(${users.username}) = ${username}`)
      .limit(1);
    if (existingUsername.length > 0) {
      return c.json({ error: 'That username is already taken.' }, 409);
    }

    const existingEmail = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`LOWER(${users.email}) = ${email}`)
      .limit(1);
    if (existingEmail.length > 0) {
      return c.json({ error: 'An account with that email already exists.' }, 409);
    }

    const userId = generateId('usr');
    const now = new Date().toISOString();
    const passwordHash = hashPassword(password);
    const initialTheme = ['light', 'dark', 'system'].includes(body.theme || '')
      ? body.theme!
      : 'dark';
    const initialWallpaper = validWallpapers.includes(body.chatWallpaper || '')
      ? body.chatWallpaper!
      : 'solid-obsidian';
    const initialAllowDm = ['everyone', 'contacts'].includes(body.allowDirectMessages || '')
      ? body.allowDirectMessages!
      : 'everyone';
    const toFlag = (value: boolean | undefined, fallback: boolean) =>
      typeof value === 'boolean' ? value : fallback;

    await db.insert(users).values({
      id: userId,
      username,
      email,
      passwordHash,
      displayName,
      avatarUrl,
      bio: bio || '',
      statusText,
      phone: phone || '',
      pronouns: pronouns || '',
      title: title || '',
      isOnline: true,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(userSettings).values({
      userId,
      theme: initialTheme,
      notificationsEnabled: toFlag(body.notificationsEnabled, true),
      soundEnabled: toFlag(body.soundEnabled, true),
      desktopNotifications: false,
      showReadReceipts: toFlag(body.showReadReceipts, true),
      showOnlineStatus: toFlag(body.showOnlineStatus, true),
      showTypingIndicator: toFlag(body.showTypingIndicator, true),
      allowDirectMessages: initialAllowDm,
      chatWallpaper: initialWallpaper,
    });

    // Create a personal "Saved Messages" conversation for the user
    const savedConvId = generateId('conv');
    await db.insert(conversations).values({
      id: savedConvId,
      type: 'direct',
      name: 'Saved Messages',
      description: 'Personal notes, links, and file storage.',
      avatarUrl: null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    });
    await db.insert(conversationMembers).values({
      conversationId: savedConvId,
      userId,
      role: 'owner',
      lastReadAt: now,
      joinedAt: now,
    });

    const token = await createSessionForUser(userId, c);
    const userRow = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const settingsRow = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    return c.json({ token, user: hydrateUser(userRow[0], settingsRow[0]) }, 201);
  } catch (err) {
    console.error('[Auth] Register error:', err);
    return c.json({ error: 'Unable to complete registration. Please try again.' }, 500);
  }
});

authApp.post('/login', authRateLimiter, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({} as any));
    const rawIdentifier = sanitizeText(
      body?.identifier || body?.email || body?.username,
      120,
    ).toLowerCase();
    const identifier = rawIdentifier.startsWith('@') ? rawIdentifier.slice(1) : rawIdentifier;
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!identifier || !password) {
      return c.json({ error: 'Please enter both your username/email and password.' }, 400);
    }

    const db = getDb();
    const userRows = await db
      .select()
      .from(users)
      .where(sql`LOWER(${users.email}) = ${identifier} OR LOWER(${users.username}) = ${identifier}`)
      .limit(1);

    if (!userRows[0] || !verifyPassword(password, userRows[0].passwordHash)) {
      return c.json(
        { error: 'Invalid credentials. Please verify your username/email and password.' },
        401,
      );
    }

    const now = new Date().toISOString();
    await db.update(users).set({ isOnline: true, lastSeenAt: now }).where(eq(users.id, userRows[0].id));

    const token = await createSessionForUser(userRows[0].id, c);
    const settingsRow = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userRows[0].id))
      .limit(1);

    return c.json({ token, user: hydrateUser(userRows[0], settingsRow[0]) });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    return c.json({ error: 'Unable to sign in right now. Please try again.' }, 500);
  }
});

authApp.post('/logout', requireAuth, async (c) => {
  const token = c.get('sessionToken');
  if (token) {
    await getDb().delete(sessions).where(eq(sessions.token, token));
  }
  return c.json({ success: true });
});

authApp.get('/me', requireAuth, async (c) => {
  return c.json({ user: c.get('user') });
});

authApp.post('/forgot-password', authRateLimiter, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({} as any));
    const email = sanitizeText(body?.email || body?.identifier, 120).toLowerCase();
    if (!email) {
      return c.json({ error: 'Please provide your account email or username.' }, 400);
    }

    const db = getDb();
    const userRows = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`LOWER(${users.email}) = ${email} OR LOWER(${users.username}) = ${email}`)
      .limit(1);

    let resetToken: string | null = null;
    if (userRows[0]) {
      resetToken = generateId('rst').toUpperCase();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
      await db.insert(passwordResets).values({
        token: resetToken,
        userId: userRows[0].id,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
      });
      console.log(`[Auth] Password reset code generated for ${email}: ${resetToken}`);
    }

    // Demo environment: the reset code is returned so the flow is testable end-to-end
    return c.json({
      message: 'If an account matches those details, a reset code was generated.',
      resetCode: resetToken,
    });
  } catch {
    return c.json({ error: 'Unable to process password recovery. Please try again.' }, 500);
  }
});

authApp.post('/reset-password', authRateLimiter, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({} as any));
    const token = sanitizeText(body?.token || body?.code, 100).toUpperCase();
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

    if (!token) return c.json({ error: 'Reset code is required.' }, 400);
    if (newPassword.length < 6) {
      return c.json({ error: 'New password must be at least 6 characters.' }, 400);
    }

    const db = getDb();
    const resetRows = await db
      .select()
      .from(passwordResets)
      .where(eq(passwordResets.token, token))
      .limit(1);
    const reset = resetRows[0];

    if (!reset || reset.expiresAt < new Date().toISOString()) {
      return c.json({ error: 'Invalid or expired password reset code.' }, 400);
    }

    await db
      .update(users)
      .set({ passwordHash: hashPassword(newPassword), updatedAt: new Date().toISOString() })
      .where(eq(users.id, reset.userId));
    await db.delete(passwordResets).where(eq(passwordResets.userId, reset.userId));
    await db.delete(sessions).where(eq(sessions.userId, reset.userId));

    return c.json({ success: true });
  } catch {
    return c.json({ error: 'Unable to reset password. Please try again.' }, 500);
  }
});

authApp.post('/change-password', requireAuth, async (c) => {
  try {
    const userId = c.get('user').id;
    const body = await c.req.json().catch(() => ({} as any));
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

    if (newPassword.length < 6) {
      return c.json({ error: 'New password must be at least 6 characters long.' }, 400);
    }

    const db = getDb();
    const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!userRows[0] || !verifyPassword(currentPassword, userRows[0].passwordHash)) {
      return c.json({ error: 'Current password is incorrect.' }, 401);
    }

    await db
      .update(users)
      .set({ passwordHash: hashPassword(newPassword), updatedAt: new Date().toISOString() })
      .where(eq(users.id, userId));

    return c.json({ success: true });
  } catch {
    return c.json({ error: 'Unable to change password. Please try again.' }, 500);
  }
});

authApp.get('/sessions', requireAuth, async (c) => {
  const userId = c.get('user').id;
  const currentSessionId = c.get('sessionId');
  const db = getDb();
  const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
  return c.json({
    sessions: rows
      .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
      .map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        isCurrent: s.id === currentSessionId,
      })),
  });
});

authApp.delete('/sessions/:id', requireAuth, async (c) => {
  const userId = c.get('user').id;
  const targetId = c.req.param('id');
  const db = getDb();
  await db.delete(sessions).where(sql`${sessions.id} = ${targetId} AND ${sessions.userId} = ${userId}`);
  return c.json({ success: true });
});

authApp.delete('/sessions', requireAuth, async (c) => {
  const userId = c.get('user').id;
  const currentSessionId = c.get('sessionId');
  const db = getDb();
  const rows = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
  for (const row of rows) {
    if (row.id !== currentSessionId) {
      await db.delete(sessions).where(eq(sessions.id, row.id));
    }
  }
  return c.json({ success: true });
});
