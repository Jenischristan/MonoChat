import { Hono } from 'hono';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { getRequestListener } from '@hono/node-server';
import { WebSocketServer } from 'ws';
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
import { handleNodeWebSocketConnection } from './ws/realtime';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const DIST_DIR = path.resolve(process.cwd(), 'dist');

const app = new Hono();

// Security headers on every API response
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-XSS-Protection', '1; mode=block');
});

// CORS: reflect request origin (Google Cloud Shell / proxies / cross-origin dev)
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
    stack: 'node+hono+drizzle+pglite',
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

// Uploads route
app.get('/uploads/:filename', async (c) => {
  const fileName = path.basename(c.req.param('filename'));
  const filePath = path.join(UPLOADS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return c.json({ error: 'File not found.' }, 404);
  }

  const stat = fs.statSync(filePath);
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.mp3': 'audio/mpeg',
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  c.header('Content-Type', contentType);
  c.header('Content-Length', String(stat.size));
  c.header('Cache-Control', 'public, max-age=3600');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-XSS-Protection', '1; mode=block');

  if (c.req.query('download') === '1') {
    const downloadName = (c.req.query('name') || fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    c.header('Content-Disposition', `attachment; filename="${downloadName}"`);
  }

  const buffer = fs.readFileSync(filePath);
  return c.body(buffer);
});

// Unknown API endpoint
app.notFound((c) => {
  if (c.req.path.startsWith('/api') || c.req.path.startsWith('/uploads')) {
    return c.json({ error: 'API endpoint not found.' }, 404);
  }
  return c.json({ error: 'Not found.' }, 404);
});

// Global error handler
app.onError((err, c) => {
  console.error('[MonoChat] Unhandled API error:', err);
  return c.json({ error: err.message || 'Internal server error' }, 500);
});

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
  };
  return map[ext] || 'application/octet-stream';
}

function serveProdStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  let pathname = decodeURIComponent(parsedUrl.pathname);
  const filePath = path.join(DIST_DIR, pathname);

  if (pathname.startsWith('/assets/')) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, {
        'Content-Type': getMimeType(filePath),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      });
      return fs.createReadStream(filePath).pipe(res);
    }
  }

  if (pathname !== '/' && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, {
      'Content-Type': getMimeType(filePath),
      'Cache-Control': 'public, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    });
    return fs.createReadStream(filePath).pipe(res);
  }

  const indexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    return fs.createReadStream(indexPath).pipe(res);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

async function startServer() {
  await openDb();
  await runMigrations();
  await seedIfEmpty();

  const listener = getRequestListener(app.fetch);

  let vite: any = null;
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
  }

  const server = http.createServer(async (req, res) => {
    const rawUrl = req.url || '/';
    if (rawUrl.startsWith('/api/') || rawUrl.startsWith('/uploads/')) {
      listener(req, res);
      return;
    }

    if (vite) {
      vite.middlewares(req, res, async () => {
        try {
          const indexPath = path.resolve(process.cwd(), 'index.html');
          let template = fs.readFileSync(indexPath, 'utf-8');
          template = await vite.transformIndexHtml(rawUrl, template);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(template);
        } catch (err: any) {
          vite.ssrFixStacktrace(err);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(err.message);
        }
      });
      return;
    }

    serveProdStatic(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', 'http://localhost');
    const token = url.searchParams.get('token');
    handleNodeWebSocketConnection(ws, token);
  });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '', 'http://localhost');
    if (url.pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[MonoChat] Server running on http://0.0.0.0:${PORT} (${IS_PROD ? 'production' : 'development'})`);
    console.log(`[MonoChat] WebSocket gateway at ws://0.0.0.0:${PORT}/ws`);
  });

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[MonoChat] ${signal} received — shutting down…`);
    try {
      wss.close();
      server.close();
      if (vite) {
        await vite.close();
      }
      await closeDb();
    } catch (err) {
      console.error('[MonoChat] Error during shutdown:', err);
    }
    process.exit(0);
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('beforeExit', () => void closeDb());
}

startServer().catch((err) => {
  console.error('[MonoChat] Fatal server startup error:', err);
  process.exit(1);
});
