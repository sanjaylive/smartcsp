'use client';

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PlatformPermission } from '@csp2all/shared';
import { api, isApiError, onAuthError } from './api';
import type { AdminMe } from './types';
import { ToastProvider } from '@/components/toast';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: (count, err) =>
              !(isApiError(err) && err.status >= 400 && err.status < 500) && count < 2,
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AuthRedirects />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}

/** Any API call that reports an ended/locked session sends the admin back to sign-in. */
function AuthRedirects() {
  const router = useRouter();
  const qc = useQueryClient();
  useEffect(
    () =>
      onAuthError((e) => {
        if (
          typeof window !== 'undefined' &&
          window.location.pathname.startsWith(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/login`)
        )
          return;
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
        void qc.invalidateQueries({ queryKey: ['me'] });
        const reason =
          e.code === 'SESSION_EXPIRED' ? 'expired' : e.code === 'MFA_REQUIRED' ? 'mfa' : 'signin';
        router.replace(`/login?reason=${reason}`);
      }),
    [qc, router],
  );
  return null;
}

export const meQueryKey = ['me'] as const;

export function useMeQuery() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: () => api<AdminMe>('/v1/admin/auth/me', { silentAuth: true }),
    staleTime: 60_000,
    retry: false,
  });
}

const MeCtx = createContext<AdminMe | null>(null);

export function MeProvider({ me, children }: { me: AdminMe; children: ReactNode }) {
  return <MeCtx.Provider value={me}>{children}</MeCtx.Provider>;
}

export function useMe(): AdminMe {
  const me = useContext(MeCtx);
  if (!me) throw new Error('useMe outside the admin console');
  return me;
}

/** Client-side permission check (UI only — the API enforces every permission). */
export function useCan() {
  const me = useMe();
  return (p: PlatformPermission) => me.permissions.includes(p);
}
