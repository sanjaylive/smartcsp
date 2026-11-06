'use client';

import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button, Field, FormError, Input, Textarea, cx } from './ui';

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-[#0e1020]/55 backdrop-blur-[1px]" />
        <RD.Content
          className={cx(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-line bg-surface shadow-xl focus:outline-none',
            wide ? 'max-w-3xl' : 'max-w-lg',
          )}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <RD.Title className="text-base font-semibold">{title}</RD.Title>
              {description && (
                <RD.Description className="mt-0.5 text-[13px] text-fg-muted">
                  {description}
                </RD.Description>
              )}
            </div>
            <RD.Close asChild>
              <button
                type="button"
                className="rounded p-1 text-fg-muted hover:bg-muted"
                aria-label="Close dialog"
              >
                <X className="size-4" aria-hidden />
              </button>
            </RD.Close>
          </div>
          <div className="overflow-y-auto px-4 py-3">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">
              {footer}
            </div>
          )}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  body?: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger' | 'warning';
  /** Require a reason of at least N characters (sent to the API and audited). */
  reasonMin?: number;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** Require the user to type this exact text before confirming. */
  typeToConfirm?: string;
  onConfirm: (reason: string) => Promise<unknown>;
}

/**
 * Confirmation dialog for destructive or sensitive actions. Keeps itself open and shows the API
 * error if the action fails; closes on success.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  ...o
}: ConfirmOptions & { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const reasonOk = o.reasonMin === undefined || reason.trim().length >= o.reasonMin;
  const typedOk = o.typeToConfirm === undefined || typed === o.typeToConfirm;

  const reset = () => {
    setReason('');
    setTyped('');
    setError(null);
    setBusy(false);
  };

  const submit = async () => {
    if (!reasonOk || !typedOk) return;
    setBusy(true);
    setError(null);
    try {
      await o.onConfirm(reason.trim());
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title={o.title}
      description={o.description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={o.tone ?? 'primary'}
            onClick={submit}
            loading={busy}
            disabled={!reasonOk || !typedOk}
          >
            {o.confirmLabel}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {o.body}
        {o.reasonMin !== undefined && (
          <Field
            label={o.reasonLabel ?? 'Reason (recorded in the audit log)'}
            required
            hint={`At least ${o.reasonMin} characters.`}
          >
            {(p) => (
              <Textarea
                {...p}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={o.reasonPlaceholder}
                maxLength={500}
                autoFocus
              />
            )}
          </Field>
        )}
        {o.typeToConfirm !== undefined && (
          <Field
            label={
              <>
                Type <strong className="font-semibold">{o.typeToConfirm}</strong> to confirm
              </>
            }
            required
          >
            {(p) => (
              <Input
                {...p}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>
        )}
        <FormError error={error} />
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

/** Small helper hook: `const [confirm, dialog] = useConfirm();` then `confirm({...})`. */
export function useConfirm(): [(o: ConfirmOptions) => void, ReactNode] {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const node = opts ? (
    <ConfirmDialog key={String(opts.title)} open={open} onOpenChange={setOpen} {...opts} />
  ) : null;
  return [
    (o) => {
      setOpts(o);
      setOpen(true);
    },
    node,
  ];
}
