import { Hono } from 'hono';
import path from 'node:path';
import fs from 'node:fs';
import { openDb, closeDb } from './db/client';
import { runMigrations, seedIfEmpty } from './db/migrate';
import { authApp } from './routes/auth';
import { usersApp } from './routes/users';
import { conversationsApp } from './routes/conversations';
import { groupsApp } from './routes/groups';
import { messagesApp } from './routes/messages';
import { filesApp, UPLOADS_DIR } from './routes/files';
import { searchApp } from './routes/search';
import { notificationsApp } from './routes/notifications';
import { tryUpgrade, websocketHandlers } from './ws/realtime';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const IS_PROD = process.env.NODE_ENV === 'production';
const DIST_DIR = path.resolve(process.cwd(), 'dist');

const app = new Hono();

// Security headers on every API/static response
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-XSS-Protection', '1; mode=block');
});

// CORS: reflect request origin (Google Cloud Shell / proxies / cross-origin dev),
// with Vary: Origin so caches key responses on the origin header.
app.use('*', async (c, next) => {
  const origin = c.req.header('origin');
  if (origin) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
    c.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma',
    );
    c.header('Vary', 'Origin');
  }
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }
  await next();
});

// Health check
app.get('/api/health', (c) =>
  c.json({
    status: 'ok',
    service: 'monochat',
    stack: 'bun+hono+drizzle+postgres',
    env: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.round(performance.now() / 1000),
    timestamp: new Date().toISOString(),
  }),
);

// API routers
app.route('/api/auth', authApp);
app.route('/api/users', usersApp);
app.route('/api/conversations', conversationsApp);
app.route('/api/groups', groupsApp);
app.route('/api/messages', messagesApp);
app.route('/api/files', filesApp);
app.route('/api/search', searchApp);
app.route('/api/notifications', notificationsApp);

// Unknown API endpoint
app.notFound((c) => {
  if (c.req.path.startsWith('/api') || c.req.path.startsWith('/uploads')) {
    return c.json({ error: 'API endpoint not found.' }, 404);
  }
  return c.json({ error: 'Not found.' }, 404);
});

// Global error handler → JSON responses
app.onError((err, c) => {
  console.error('[MonoChat] Unhandled API error:', err);
  return c.json({ error: err.message || 'Internal server error' }, 500);
});

function serveUploads(req: Request): Response | undefined {
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/uploads/')) return undefined;

  const fileName = path.basename(url.pathname);
  const filePath = path.join(UPLOADS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return new Response(JSON.stringify({ error: 'File not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  const headers: Record<string, string> = {
    'Cache-Control': 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
  };
  if (url.searchParams.get('download') === '1') {
    const downloadName = (url.searchParams.get('name') || fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    headers['Content-Disposition'] = `attachment; filename="${downloadName}"`;
  }

  const file = Bun.file(filePath);
  headers['Content-Type'] = file.type || 'application/octet-stream';
  return new Response(file, { headers });
}

function serveStatic(req: Request): Response | undefined {
  const url = new URL(req.url);
  let pathname = decodeURIComponent(url.pathname);

  // API/uploads are handled elsewhere
  if (pathname.startsWith('/api/') || pathname.startsWith('/uploads/') || pathname === '/ws') {
    return undefined;
  }

  if (IS_PROD) {
    // Hashed assets get immutable caching
    if (pathname.startsWith('/assets/')) {
      const assetPath = path.join(DIST_DIR, pathname);
      if (fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
        return new Response(Bun.file(assetPath), {
          headers: {
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      return undefined;
    }

    // Other static files (favicon etc.)
    const staticPath = path.join(DIST_DIR, pathname);
    if (pathname !== '/' && fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
      return new Response(Bun.file(staticPath), {
        headers: { 'Cache-Control': 'public, max-age=0', 'X-Content-Type-Options': 'nosniff' },
      });
    }

    // SPA fallback
    const indexPath = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      return new Response(Bun.file(indexPath), {
        headers: { 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' },
      });
    }
    return undefined;
  }

  // In dev, non-API GET requests fall back to the Vite index.html entry
  // (the browser still loads the app itself from the Vite server on :3000).
  if ((req.method === 'GET' || req.method === 'HEAD') && !pathname.startsWith('/@')) {
    const devIndexPath = path.resolve(process.cwd(), 'index.html');
    if (fs.existsSync(devIndexPath)) {
      return new Response(Bun.file(devIndexPath), {
        headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'text/html' },
      });
    }
  }
  return undefined;
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 255, // max idle timeout for WS keep-alive (seconds)
  async fetch(req, bunServer) {
    // WebSocket upgrade on /ws
    const upgradeResponse = await tryUpgrade(req, bunServer as any);
    if (upgradeResponse === undefined && (req.headers.get('upgrade') || '').toLowerCase() === 'websocket') {
      return new Response(null, { status: 101 }); // already upgraded
    }
    if (upgradeResponse) {
      return upgradeResponse;
    }

    const uploadsResponse = serveUploads(req);
    if (uploadsResponse) return uploadsResponse;

    const staticResponse = serveStatic(req);
    if (staticResponse) return staticResponse;

    try {
      return await app.fetch(req, bunServer);
    } catch (err) {
      console.error('[MonoChat] Fetch error:', err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
  websocket: websocketHandlers as any,
});

async function main() {
  await openDb();
  await runMigrations();
  await seedIfEmpty();

  console.log(
    `[MonoChat] Bun + Hono API server running on http://0.0.0.0:${PORT} (${IS_PROD ? 'production' : 'development'})`,
  );
  console.log(`[MonoChat] WebSocket gateway at ws://0.0.0.0:${PORT}/ws`);
}

main().catch((err) => {
  console.error('[MonoChat] Fatal server startup error:', err);
  process.exit(1);
});

// Graceful shutdown — stop accepting connections, checkpoint & close the
// embedded Postgres (PGlite) so the data directory is always left consistent.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[MonoChat] ${signal} received — shutting down…`);
  try {
    server.stop(true);
    await closeDb();
  } catch (err) {
    console.error('[MonoChat] Error during shutdown:', err);
  }
  process.exit(0);
}
process.on('SIGINT' as any, () => void shutdown('SIGINT'));
process.on('SIGTERM' as any, () => void shutdown('SIGTERM'));
process.on('beforeExit' as any, () => void closeDb());
