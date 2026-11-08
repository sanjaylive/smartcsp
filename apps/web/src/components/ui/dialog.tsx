'use client';

import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  const { t } = useI18n();
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px]" />
        <RD.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl border border-border bg-surface shadow-2xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
            size === 'xl' ? 'sm:max-w-4xl' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <RD.Title className="text-lg font-bold">{title}</RD.Title>
              {description ? (
                <RD.Description className="mt-1 text-sm text-fg-muted">
                  {description}
                </RD.Description>
              ) : (
                <RD.Description className="sr-only">{title}</RD.Description>
              )}
            </div>
            <RD.Close
              className="-m-2 flex size-11 items-center justify-center rounded-lg hover:bg-surface-muted"
              aria-label={t('common.close')}
            >
              <X aria-hidden className="size-5" />
            </RD.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
              {footer}
            </div>
          ) : null}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/**
 * Side panel with the same API as Dialog. A floating sheet on the right on larger screens and a
 * bottom sheet on phones, keeping the page underneath in view — used for create/edit forms and
 * step-by-step flows (pass `steps` for a progress bar under the title).
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  icon,
  steps,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Small icon/tile shown before the title. */
  icon?: ReactNode;
  /** Rendered under the header, e.g. a step indicator. */
  steps?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  const { t } = useI18n();
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="drawer-overlay fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]" />
        <RD.Content
          onOpenAutoFocus={(e) => {
            // Start in the first field rather than on the close button.
            const el = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(
              '[data-drawer-body] input:not([type=hidden]):not([disabled]), [data-drawer-body] textarea, [data-drawer-body] button[role=combobox]',
            );
            if (el) {
              e.preventDefault();
              el.focus();
            }
          }}
          className={cn(
            'drawer-panel fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] flex-col overflow-hidden rounded-t-3xl bg-surface shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.35)] ring-1 ring-border outline-none',
            'sm:inset-y-2 sm:right-2 sm:left-auto sm:max-h-none sm:w-[calc(100%-1rem)] sm:rounded-2xl sm:shadow-[0_24px_64px_-16px_rgba(0,0,0,0.35)]',
            size === 'xl' ? 'sm:max-w-3xl' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md',
          )}
        >
          {/* grab handle on phones */}
          <div
            aria-hidden
            className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden"
          />
          <div className="flex shrink-0 items-start gap-3 px-5 pt-3 pb-3 sm:pt-4">
            {icon ? <span className="shrink-0">{icon}</span> : null}
            <div className="min-w-0 flex-1">
              <RD.Title className="font-display text-lg leading-tight font-bold tracking-tight">
                {title}
              </RD.Title>
              {description ? (
                <RD.Description className="mt-0.5 text-[13px] text-fg-muted">
                  {description}
                </RD.Description>
              ) : (
                <RD.Description className="sr-only">{title}</RD.Description>
              )}
            </div>
            <RD.Close
              className="-mt-1 -mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-muted hover:text-fg"
              aria-label={t('common.close')}
            >
              <X aria-hidden className="size-5" />
            </RD.Close>
          </div>
          {steps ? <div className="shrink-0 px-5 pb-3">{steps}</div> : null}
          <div className="h-px shrink-0 bg-border" />
          <div data-drawer-body className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
            {children}
          </div>
          {footer ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-muted/50 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/** Step indicator for multi-step drawers. */
export function StepBar({
  steps,
  current,
  onStep,
}: {
  steps: string[];
  current: number;
  /** Lets users jump back to an earlier step. */
  onStep?: (i: number) => void;
}) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span
              aria-hidden
              className={cn(
                'h-1 rounded-full transition-colors duration-300',
                done || active ? 'bg-brand' : 'bg-border',
                active && 'opacity-60',
              )}
            />
            <button
              type="button"
              disabled={!onStep || i >= current}
              onClick={() => onStep?.(i)}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'truncate text-left text-[11px] font-semibold tracking-wide uppercase transition-colors',
                active ? 'text-fg' : done ? 'text-brand enabled:hover:underline' : 'text-fg-muted',
              )}
            >
              {s}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
