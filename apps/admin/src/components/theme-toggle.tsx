'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Theme preference is a per-browser convenience (localStorage); no credentials are ever stored there. */
export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('csp2all-admin-theme', next ? 'dark' : 'light');
    } catch {
      /* storage unavailable */
    }
    setDark(next);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-md p-2 text-fg-muted hover:bg-muted hover:text-fg"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title="Toggle theme"
    >
      {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}
