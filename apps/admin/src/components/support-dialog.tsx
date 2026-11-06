'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal } from './dialog';
import { useToast } from './toast';
import { Button, Callout, Field, FormError, Input, Select, Textarea } from './ui';
import { isApiError, post } from '@/lib/api';
import type { SupportSession } from '@/lib/types';

const DURATIONS = [15, 30, 60, 90, 120];

/** Opens a time-limited, reasoned, read-only support session. The shop is notified. */
export function StartSupportDialog({
  tenantId: initialTenantId,
  tenantName,
  onClose,
}: {
  tenantId?: string;
  tenantName?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [tenantId, setTenantId] = useState(initialTenantId ?? '');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState(30);
  const m = useMutation({
    mutationFn: () =>
      post<SupportSession>('/v1/admin/support-sessions', {
        tenantId: tenantId.trim(),
        reason: reason.trim(),
        durationMinutes: duration,
      }),
    onSuccess: (s) => {
      toast.success('Support session started. The shop has been notified.');
      void qc.invalidateQueries({ queryKey: ['support-sessions'] });
      void qc.invalidateQueries({ queryKey: ['tenant', s.tenantId] });
      onClose();
      router.push(`/support/${s.id}`);
    },
  });
  const err = (f: string) => (isApiError(m.error) ? m.error.field(f) : undefined);
  const valid = /^[0-9a-f-]{36}$/i.test(tenantId.trim()) && reason.trim().length >= 10;
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Start support session"
      description={
        tenantName ? `Read-only access to ${tenantName}.` : 'Read-only access to one shop.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!valid}
            onClick={() => m.mutate()}
          >
            Start read-only session
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Callout tone="warning" title="The shop will see this">
          Support access is never silent. The shop gets a notification with your reason, and every
          record you open is written to their audit history. Access is read-only, sensitive
          identifiers stay masked, and it ends automatically.
        </Callout>
        {!initialTenantId && (
          <Field label="Tenant ID" required error={err('tenantId')}>
            {(p) => (
              <Input
                {...p}
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="font-mono"
              />
            )}
          </Field>
        )}
        <Field
          label="Reason (shown to the shop)"
          required
          hint="At least 10 characters, e.g. the support ticket and what you need to check."
          error={err('reason')}
        >
          {(p) => (
            <Textarea
              {...p}
              name="support-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          )}
        </Field>
        <Field
          label="Duration"
          required
          hint="Maximum 2 hours. You can end it earlier."
          error={err('durationMinutes')}
        >
          {(p) => (
            <Select {...p} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} minutes
                </option>
              ))}
            </Select>
          )}
        </Field>
        <FormError error={m.error} />
      </div>
    </Modal>
  );
}
