'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { Locale } from '@csp2all/shared';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider, type ThemePref } from '@/lib/theme';
import { isApiError } from '@/lib/api';
import { ToastProvider } from './ui/toast';

export function Providers({
  locale,
  theme,
  children,
}: {
  locale: Locale;
  theme: ThemePref;
  children: ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => {
              // Do not retry deterministic API errors (permission, not found, validation…).
              if (isApiError(err) && err.status > 0 && err.status < 500) return false;
              return count < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <ThemeProvider initialTheme={theme}>
      <I18nProvider initialLocale={locale}>
        <QueryClientProvider client={client}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
