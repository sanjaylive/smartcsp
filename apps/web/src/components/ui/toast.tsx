'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';

interface Toast {
  id: number;
  kind: 'success' | 'error';
  text: string;
}

const ToastContext = createContext<(kind: Toast['kind'], text: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg',
              toast.kind === 'success'
                ? 'border-success/40 bg-success-bg text-fg'
                : 'border-danger/40 bg-danger-bg text-fg',
            )}
          >
            {toast.kind === 'success' ? (
              <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
            ) : (
              <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
            )}
            <p className="flex-1 text-sm font-medium">{toast.text}</p>
            <button
              type="button"
              aria-label={t('common.close')}
              className="-m-1 rounded p-1"
              onClick={() => setToasts((ts) => ts.filter((x) => x.id !== toast.id))}
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
