import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), 'src'),
      },
    },
    server: {
      // Bind dual-stack (IPv4 + IPv6) so 127.0.0.1, ::1 and the Caddy gateway all reach us
      host: '::',
      allowedHosts: true as const,
      // Hono (the API server) owns CORS handling — Vite must not intercept preflights
      cors: false,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: false,
        },
        '/uploads': {
          target: 'http://localhost:3001',
          changeOrigin: false,
        },
        '/ws': {
          target: 'ws://localhost:3001',
          ws: true,
        },
      },
    },
  };
});
