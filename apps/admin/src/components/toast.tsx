'use client';

import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cx } from './ui';

interface Toast {
  id: number;
  tone: 'success' | 'error';
  message: string;
}

const Ctx = createContext<(tone: Toast['tone'], message: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast['tone'], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      tone === 'error' ? 8000 : 4500,
    );
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex items-start gap-2 rounded-md border bg-surface px-3 py-2.5 text-sm shadow-lg',
              t.tone === 'error' ? 'border-danger/50' : 'border-success/50',
            )}
          >
            {t.tone === 'error' ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            )}
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              className="rounded p-0.5 text-fg-muted hover:bg-muted"
              aria-label="Dismiss notification"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const push = useContext(Ctx);
  return { success: (m: string) => push('success', m), error: (m: string) => push('error', m) };
}
