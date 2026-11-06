'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
export const THEME_COOKIE = 'csp2all_theme';

interface ThemeValue {
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: ThemePref;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemePref>(initialTheme);
  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    document.cookie = `${THEME_COOKIE}=${t}; path=/; max-age=31536000; samesite=lax`;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }, []);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}

/** Effective dark state for toggles (system preference resolved on the client). */
export function isDark(theme: ThemePref): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
