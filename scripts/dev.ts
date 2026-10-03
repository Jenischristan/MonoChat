/**
 * Dev orchestrator: starts the Hono API server (bun --watch, port 3001)
 * and the Vite dev server (port 3000) together, forwarding shutdown signals.
 */

const children: Bun.Subprocess[] = [];

function spawn(name: string, args: string[], color: string) {
  const child = Bun.spawn(['bun', ...args], {
    cwd: process.cwd(),
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  children.push(child);
  console.log(`${color}[dev] ${name} started (pid ${child.pid})\x1b[0m`);
}

function shutdown() {
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      // already dead
    }
  }
  process.exit(0);
}

process.on('SIGINT' as any, shutdown);
process.on('SIGTERM' as any, shutdown);

console.log('[dev] Starting MonoChat (Hono API :3001 + Vite :3000)…');
spawn('api', ['--watch', 'server/index.ts'], '\x1b[36m');
spawn('web', ['vite', '--port', '3000', '--strictPort'], '\x1b[35m');

// Keep the orchestrator alive; exit when any child dies
setInterval(() => {
  if (children.some((c) => c.exitCode !== null || c.signalCode !== null)) {
    console.error('[dev] A child process exited — shutting down.');
    shutdown();
  }
}, 1000);
