'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { dictionaries, type Locale, type TranslationKey } from '@csp2all/shared';
import { localEn, localHi, type LocalKey } from './i18n-local';

export type Key = TranslationKey | LocalKey;
export type TFn = (key: Key, vars?: Record<string, string | number>) => string;

const local: Record<Locale, Record<string, string>> = { en: localEn, hi: localHi };

/**
 * Lookup order: shared dictionary for the locale → web supplement for the locale → English
 * (shared, then supplement) → the key itself (custom service labels are literal text).
 */
export function translateKey(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const shared = dictionaries[locale] as Record<string, string>;
  const sharedEn = dictionaries.en as Record<string, string>;
  let s = shared[key] ?? local[locale][key] ?? sharedEn[key] ?? localEn[key as LocalKey] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: TFn;
  /** Translate a dynamically-built key (e.g. `status.${s}`); falls back to the key. */
  tk: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export const LOCALE_COOKIE = 'csp2all_locale';

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    // Preference only (not a credential): readable cookie so the server can render the right language.
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
  }, []);
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translateKey(locale, key, vars),
      tk: (key, vars) => translateKey(locale, key, vars),
    }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}
