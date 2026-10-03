import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  RouterProvider,
} from '@tanstack/react-router';
import { useAuthStore } from './stores/auth';
import { AppLayout, ConversationView, EmptyChatState } from './routes/AppLayout';
import { AuthScreen } from './components/auth/AuthScreen';
import { MonoChatLogo } from './components/ui/DesignSystem';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      staleTime: 15_000,
    },
  },
});

function BootGate() {
  const booting = useAuthStore((s) => s.booting);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  React.useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Global unauthorized handler → login
  React.useEffect(() => {
    const handler = () => {
      const current = window.location.pathname;
      if (!current.startsWith('/login') && !current.startsWith('/register')) {
        window.location.href = '/login';
      }
    };
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, []);

  if (booting) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 bg-[var(--bg-canvas)]">
        <MonoChatLogo size="xl" className="animate-pulse" />
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--text-muted)]">
          MonoChat
        </p>
      </div>
    );
  }
  return <Outlet />;
}

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const user = useAuthStore((s) => s.user);
  const booting = useAuthStore((s) => s.booting);

  React.useEffect(() => {
    if (!booting && user) {
      window.location.href = '/app';
    }
  }, [user, booting]);

  if (booting) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[var(--bg-canvas)]">
        <MonoChatLogo size="xl" className="animate-pulse" />
      </div>
    );
  }
  return <AuthScreen initialMode={mode} />;
}

const rootRoute = createRootRoute({ component: BootGate });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: useAuthStore.getState().token ? '/app' : '/login' });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: () => <AuthPage mode="login" />,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: () => <AuthPage mode="register" />,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  component: AppLayout,
  beforeLoad: () => {
    if (!useAuthStore.getState().token) {
      throw redirect({ to: '/login' });
    }
  },
});

const appIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: EmptyChatState,
});

const conversationRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/c/$conversationId',
  component: ConversationRouteComponent,
});

function ConversationRouteComponent() {
  const { conversationId } = conversationRoute.useParams();
  return <ConversationView conversationId={conversationId} />;
}

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  appRoute.addChildren([appIndexRoute, conversationRoute]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

const rootElement = document.getElementById('root')!;
createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
