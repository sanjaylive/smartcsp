'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { Locale } from '@csp2all/shared';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider, type ThemePref } from '@/lib/theme';
import { BrandProvider, BRAND_DEFAULTS, type Brand } from '@/lib/brand';
import { isApiError } from '@/lib/api';
import { ToastProvider } from './ui/toast';

export function Providers({
  locale,
  theme,
  brand = BRAND_DEFAULTS,
  children,
}: {
  locale: Locale;
  theme: ThemePref;
  brand?: Brand;
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
        <BrandProvider brand={brand}>
          <QueryClientProvider client={client}>
            <ToastProvider>{children}</ToastProvider>
          </QueryClientProvider>
        </BrandProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
