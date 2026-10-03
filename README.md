# MonoChat

A full-stack, real-time messaging workspace engineered with a strict monochrome design system.

**Stack:** React 19 + Vite + TanStack Router/Query + Zustand on a Bun + Hono + Drizzle + Postgres (PGlite) core.

## Features

- Real-time messaging over WebSocket (typing indicators, presence, read receipts, live edits)
- Direct messages & group chats with role-based access control (owner / admin / member)
- Message reactions, edits, forwarding, and attachments (file uploads with type validation)
- User search, blocking, saved messages, and conversation management
- Notifications, password reset flows, and account deletion
- Embedded, disk-persistent Postgres (PGlite) — zero external DB required (or point `DATABASE_URL` at a real Postgres server)

## Getting Started

Requires [Bun](https://bun.sh) v1.1+.

```bash
bun install
bun run dev
```

This starts:

- **API server** (Hono + WebSocket) on `http://localhost:3001`
- **Vite dev server** (frontend) on `http://localhost:3000`

Open `http://localhost:3000` in your browser. On first boot the embedded database is created, migrated, and seeded with 3 demo users (password: `monochat`) and a "Monochrome HQ" group.

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start API (:3001) + Vite (:3000) together |
| `bun run dev:server` | API server only (watch mode) |
| `bun run dev:web` | Vite frontend only |
| `bun run lint` | Type-check with `tsc --noEmit` |
| `bun run test` | End-to-end suite (requires dev stack running) |
| `bun run test:extended` | Extended 133-check suite (requires dev stack running) |
| `bun run build` | Production frontend build to `dist/` |
| `bun run start` | Serve production build + API from a single Bun process |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:push` | Apply migrations to the database |

## Production

```bash
bun run build
bun run start
```

The Bun server serves the built SPA from `dist/`, the REST API under `/api`, uploads under `/uploads`, and the WebSocket gateway at `/ws` — all on port 3001 (override with `PORT`).

## Configuration

| Env var | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | API/production server port |
| `DATABASE_URL` | *(unset)* | Postgres connection string; unset = embedded PGlite |
| `DB_PATH` | `./db/monochat` | PGlite data directory |
| `NODE_ENV` | `development` | `production` enables static serving of `dist/` |
