'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Paperclip, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Modal } from '@/components/dialog';
import { Guard } from '@/components/guard';
import { useToast } from '@/components/toast';
import {
  Badge,
  Button,
  Callout,
  Card,
  DescList,
  Empty,
  Field,
  FormError,
  PageHeader,
  Pagination,
  QueryState,
  StatusBadge,
  Textarea,
  cx,
} from '@/components/ui';
import { get, post } from '@/lib/api';
import { dt, formatINR, humanize } from '@/lib/format';
import type { Page, PaymentSubmission } from '@/lib/types';

const TABS = ['SUBMITTED', 'APPROVED', 'REJECTED'] as const;

export default function PaymentsPage() {
  return (
    <Guard perm="payments.approve" what="payment review">
      <PaymentsInner />
    </Guard>
  );
}

function PaymentsInner() {
  const [status, setStatus] = useState<(typeof TABS)[number]>('SUBMITTED');
  const [page, setPage] = useState(1);
  const [reviewing, setReviewing] = useState<{
    s: PaymentSubmission;
    decision: 'APPROVE' | 'REJECT';
  } | null>(null);
  const q = useQuery({
    queryKey: ['payments', status, page],
    queryFn: () =>
      get<Page<PaymentSubmission>>('/v1/admin/payment-submissions', { status, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Manual payments"
        description="Shops pay by UPI, bank transfer, cash or cheque and submit the reference here. Check the money actually arrived before approving — approval activates the plan immediately."
      />
      <div className="mb-3 flex gap-1" role="tablist" aria-label="Payment status">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={status === t}
            className={cx(
              'rounded-md px-3 py-1.5 text-[13px] font-medium',
              status === t ? 'bg-brand text-on-brand' : 'text-fg-muted hover:bg-muted',
            )}
            onClick={() => {
              setStatus(t);
              setPage(1);
            }}
          >
            {t === 'SUBMITTED' ? 'Awaiting review' : humanize(t)}
          </button>
        ))}
      </div>
      <QueryState query={q}>
        {(d) =>
          d.items.length === 0 ? (
            <Card>
              <Empty
                title={
                  status === 'SUBMITTED'
                    ? 'No payments waiting for review'
                    : `No ${status.toLowerCase()} payments`
                }
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {d.items.map((s) => (
                <PaymentCard
                  key={s.id}
                  s={s}
                  onReview={(decision) => setReviewing({ s, decision })}
                />
              ))}
              <Pagination page={d.page} pages={d.pages} total={d.total} onPage={setPage} />
            </div>
          )
        }
      </QueryState>
      {reviewing && <ReviewDialog {...reviewing} onClose={() => setReviewing(null)} />}
    </>
  );
}

function MismatchFlag({ s }: { s: PaymentSubmission }) {
  if (s.amountMatches) return <Badge tone="success">Amount matches</Badge>;
  const diff = s.amountPaise - s.expectedPaise;
  return (
    <Badge tone="danger" className="text-[12px]">
      <AlertTriangle className="size-3.5" aria-hidden />
      Amount mismatch: {diff > 0 ? 'over' : 'under'} by {formatINR(Math.abs(diff))}
    </Badge>
  );
}

function PaymentCard({
  s,
  onReview,
}: {
  s: PaymentSubmission;
  onReview: (d: 'APPROVE' | 'REJECT') => void;
}) {
  return (
    <Card
      className={cx(!s.amountMatches && s.status === 'SUBMITTED' && 'border-danger/60')}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <Link href={`/tenants/${s.tenantId}`} className="text-brand hover:underline">
            {s.tenantName ?? s.tenantId}
          </Link>
          <span className="font-normal text-fg-muted">
            {s.planName ?? s.planCode} · {humanize(s.billingCycle)}
          </span>
          <StatusBadge status={s.status} />
        </span>
      }
      actions={
        s.status === 'SUBMITTED' && (
          <>
            <Button
              size="sm"
              variant="danger"
              icon={<X className="size-3.5" aria-hidden />}
              onClick={() => onReview('REJECT')}
            >
              Reject
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Check className="size-3.5" aria-hidden />}
              onClick={() => onReview('APPROVE')}
            >
              Approve
            </Button>
          </>
        )
      }
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="tabular text-2xl font-semibold">{formatINR(s.amountPaise)}</span>
            <span className="text-[13px] text-fg-muted">expected {formatINR(s.expectedPaise)}</span>
          </div>
          <div className="mt-1.5">
            <MismatchFlag s={s} />
          </div>
        </div>
        <DescList
          items={[
            ['Method', humanize(s.method)],
            [
              'Reference',
              <span key="r" className="font-mono text-[12px]">
                {s.payerReference}
              </span>,
            ],
            ['Paid on', s.paidOn ?? '—'],
            ['Submitted', dt(s.createdAt)],
            ...(s.notes ? ([['Shop notes', s.notes]] as [string, string][]) : []),
            ...(s.reviewNotes ? ([['Review notes', s.reviewNotes]] as [string, string][]) : []),
            [
              'Proof',
              s.proofs.length ? (
                <span key="p" className="flex flex-wrap gap-2">
                  {s.proofs.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1 text-[13px]">
                      <Paperclip className="size-3.5" aria-hidden />
                      {p.fileName}
                    </span>
                  ))}
                </span>
              ) : (
                'None attached'
              ),
            ],
          ]}
        />
      </div>
    </Card>
  );
}

function ReviewDialog({
  s,
  decision,
  onClose,
}: {
  s: PaymentSubmission;
  decision: 'APPROVE' | 'REJECT';
  onClose: () => void;
}) {
  const [notes, setNotes] = useState('');
  const toast = useToast();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () =>
      post(`/v1/admin/payment-submissions/${s.id}/review`, {
        decision,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success(
        decision === 'APPROVE'
          ? 'Payment approved. The plan is active and the owner was emailed.'
          : 'Payment rejected. The shop was notified.',
      );
      void qc.invalidateQueries({ queryKey: ['payments'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
      onClose();
    },
  });
  const needNotes = decision === 'REJECT' || !s.amountMatches;
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={decision === 'APPROVE' ? 'Approve payment' : 'Reject payment'}
      description={`${s.tenantName ?? s.tenantId} · ${formatINR(s.amountPaise)} via ${humanize(s.method)} (ref ${s.payerReference})`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={decision === 'APPROVE' ? 'primary' : 'danger'}
            loading={m.isPending}
            disabled={needNotes && notes.trim().length < 3}
            onClick={() => m.mutate()}
          >
            {decision === 'APPROVE' ? 'Approve and activate plan' : 'Reject payment'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!s.amountMatches && (
          <Callout tone="danger" title="The amount does not match the expected price">
            Received {formatINR(s.amountPaise)}, expected {formatINR(s.expectedPaise)}.{' '}
            {decision === 'APPROVE'
              ? 'Only approve if you have confirmed the difference is acceptable, and record why.'
              : 'Tell the shop what to correct.'}
          </Callout>
        )}
        {decision === 'APPROVE' && (
          <p className="text-[13px] text-fg-muted">
            Approving activates {s.planName ?? s.planCode} ({humanize(s.billingCycle)}) for this
            shop now. Confirm the money is in the CSP2All account first.
          </p>
        )}
        <Field
          label={decision === 'REJECT' ? 'Message to the shop' : 'Review notes'}
          required={needNotes}
          hint={
            decision === 'REJECT'
              ? 'Sent to the shop owner by email and notification.'
              : 'Kept with the audit record.'
          }
        >
          {(p) => (
            <Textarea
              {...p}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={300}
            />
          )}
        </Field>
        <FormError error={m.error} />
      </div>
    </Modal>
  );
}
