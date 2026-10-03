import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { notifications, users } from '../db/schema';
import { requireAuth, type AppEnv } from '../lib/auth';

export const notificationsApp = new Hono<AppEnv>();
notificationsApp.use('*', requireAuth);

// GET /api/notifications
notificationsApp.get('/', async (c) => {
  const userId = c.get('user').id;
  try {
    const rows = await getDb()
      .select({ notification: notifications, actorName: users.displayName, actorAvatar: users.avatarUrl })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.actorId))
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(100);

    const list = rows.map((r) => ({
      id: r.notification.id,
      userId: r.notification.userId,
      type: r.notification.type,
      title: r.notification.title,
      body: r.notification.body,
      conversationId: r.notification.conversationId,
      messageId: r.notification.messageId,
      actorId: r.notification.actorId,
      actorName: r.actorName,
      actorAvatar: r.actorAvatar,
      isRead: r.notification.isRead,
      createdAt: r.notification.createdAt,
    }));

    const unreadCount = list.filter((n) => !n.isRead).length;
    return c.json({ notifications: list, unreadCount });
  } catch (err) {
    console.error('[MonoChat] Error in GET /api/notifications:', err);
    return c.json({ notifications: [], unreadCount: 0 });
  }
});

// PATCH /api/notifications/:id/read
notificationsApp.patch('/:id/read', async (c) => {
  const userId = c.get('user').id;
  const id = c.req.param('id');
  await getDb()
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  return c.json({ success: true });
});

// POST /api/notifications/read-all
notificationsApp.post('/read-all', async (c) => {
  const userId = c.get('user').id;
  await getDb().update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
  return c.json({ success: true });
});

// DELETE /api/notifications/:id
notificationsApp.delete('/:id', async (c) => {
  const userId = c.get('user').id;
  const id = c.req.param('id');
  await getDb()
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  return c.json({ success: true });
});

// DELETE /api/notifications — clear all
notificationsApp.delete('/', async (c) => {
  const userId = c.get('user').id;
  await getDb().delete(notifications).where(eq(notifications.userId, userId));
  return c.json({ success: true });
});
