'use client';

import { use, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Download,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Upload,
} from 'lucide-react';
import {
  customFieldsToFieldDefs,
  formatDate,
  formatDateTime,
  getService,
  isPostableStatus,
  transitionNeedsReason,
  type CustomFieldDef,
  type FieldDef,
  type OpStatus,
} from '@csp2all/shared';
import { api, isApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorMessage, useFormErrors, usePermissions, useToday } from '@/lib/hooks';
import type { RecordDetail } from '@/lib/types';
import { openSignedUrl } from '@/lib/download';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  DescList,
  EmptyState,
  Field,
  Input,
  Money,
  PageHeader,
  Textarea,
  tableCls,
} from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { QueryState } from '@/components/query-state';
import {
  PaymentBadge,
  PostingBadge,
  ServiceIcon,
  StatusBadge,
  useServiceLabel,
} from '@/components/service';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

export default function RecordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useQuery({
    queryKey: ['records', 'detail', id],
    queryFn: () => api<RecordDetail>(`/v1/records/${id}`),
  });
  return (
    <QueryState query={q} rows={6}>
      {(r) => <RecordView r={r} refetch={() => q.refetch()} />}
    </QueryState>
  );
}

function RecordView({ r, refetch }: { r: RecordDetail; refetch: () => void }) {
  const { t, tk } = useI18n();
  const sp = useSearchParams();
  const { ctx, can } = usePermissions();
  const qc = useQueryClient();
  const toast = useToast();
  const label = useServiceLabel();
  const custom = r.customServiceId
    ? ctx?.customServices.find((c) => c.id === r.customServiceId)
    : null;
  const def = getService(r.serviceCode);
  const fields: FieldDef[] = custom
    ? customFieldsToFieldDefs(custom.fields as CustomFieldDef[])
    : (def?.fields ?? []);
  const name = custom?.name ?? label(r.serviceCode);
  const tz = ctx?.tenant.timezone ?? 'Asia/Kolkata';

  const [transitionTo, setTransitionTo] = useState<OpStatus | null>(null);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [conflict, setConflict] = useState(false);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['records'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['cashbook'] });
  };
  const onMutError = (e: unknown) => {
    if (isApiError(e, 'VERSION_CONFLICT')) setConflict(true);
    else toast('error', errorMessage(t, e));
  };

  const postM = useMutation({
    mutationFn: () =>
      api(`/v1/records/${r.id}/post`, { method: 'POST', body: { version: r.version } }),
    onSuccess: () => {
      toast('success', t('record.posted'));
      invalidate();
    },
    onError: onMutError,
  });

  const principalLabel = custom ? 'record.principal.generic' : def?.principalLabelKey;
  const displayValue = (f: FieldDef, v: unknown) => {
    if (v === null || v === undefined || v === '') return '—';
    if (f.type === 'select')
      return f.options?.find((o) => o.value === v)
        ? tk(f.options.find((o) => o.value === v)!.labelKey)
        : String(v);
    if (f.type === 'date') return formatDate(String(v));
    if (f.type === 'boolean') return v ? t('common.yes') : t('common.no');
    if (f.type === 'checklist' && Array.isArray(v))
      return (
        <ul className="flex flex-col gap-0.5">
          {(v as Array<{ label: string; done: boolean }>).map((i, k) => (
            <li key={k} className="flex items-center gap-1.5">
              {i.done ? (
                <CheckCircle2 aria-hidden className="size-4 text-success" />
              ) : (
                <span
                  aria-hidden
                  className="inline-block size-4 rounded-full border border-border"
                />
              )}
              <span>{i.label}</span>
              <span className="sr-only">{i.done ? t('common.done') : t('common.notDone')}</span>
            </li>
          ))}
        </ul>
      );
    const s = String(v);
    return s.includes('*') ? (
      <span className="money" title={t('record.masked')}>
        {s} <span className="text-xs text-fg-muted">({t('record.masked')})</span>
      </span>
    ) : (
      s
    );
  };

  const canTransition = can('records.transition') && r.allowedTransitions.length > 0;
  const canPostNow =
    can('records.post') &&
    r.postingStatus === 'UNPOSTED' &&
    isPostableStatus(r.workflowType, r.opStatus);
  const canReverse = can('records.reverse') && r.postingStatus === 'POSTED';

  return (
    <>
      <PageHeader
        icon={<ServiceIcon code={r.serviceCode} size="lg" />}
        title={
          <span>
            {t('record.number', { no: r.recordNo })}{' '}
            <span className="font-semibold text-fg-muted">· {name}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.opStatus} />
            <PaymentBadge status={r.paymentStatus} />
            <PostingBadge status={r.postingStatus} />
            <Badge tone="neutral">{tk(`record.source.${r.source}`)}</Badge>
          </span>
        }
        actions={
          can('records.edit') ? (
            <Button
              variant="outline"
              icon={<Pencil aria-hidden className="size-4" />}
              onClick={() => setEditOpen(true)}
            >
              {t('common.edit')}
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-4">
        {sp.get('created') ? (
          <Alert tone="success">
            <span data-testid="record-created">
              {t('recordDetail.created', { no: r.recordNo })}
            </span>
          </Alert>
        ) : null}
        {conflict ? (
          <Alert
            tone="warning"
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setConflict(false);
                  refetch();
                }}
              >
                {t('common.reload')}
              </Button>
            }
          >
            {t('error.VERSION_CONFLICT')}
          </Alert>
        ) : null}
        {r.isManual ? (
          <Alert tone="info">
            <span className="inline-flex items-start gap-2" data-testid="manual-notice">
              {t('record.manualNotice')}
              {r.opStatus === 'SUCCESSFUL' ? ` ${t('recordDetail.reportedNote')}` : ''}
            </span>
          </Alert>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title={t('newRecord.amounts')} />
            <div className="p-5">
              <DescList
                items={[
                  principalLabel && r.principalDirection !== 'NONE'
                    ? {
                        label: tk(principalLabel),
                        value: <Money paise={r.principalPaise} className="font-bold" />,
                      }
                    : null,
                  { label: t('record.customerFee'), value: <Money paise={r.customerFeePaise} /> },
                  {
                    label: t('record.expectedCommission'),
                    value: <Money paise={r.expectedCommissionPaise} />,
                  },
                  {
                    label: t('record.receivedCommission'),
                    value: <Money paise={r.receivedCommissionPaise} />,
                  },
                  {
                    label: t('newRecord.customerOwes'),
                    value: <Money paise={r.receivablePaise} />,
                  },
                  {
                    label: t('record.amountCollected'),
                    value: (
                      <span>
                        <Money paise={r.amountCollectedPaise} /> · {tk(`method.${r.paymentMethod}`)}
                      </span>
                    ),
                  },
                  r.amountAllocatedPaise
                    ? {
                        label: t('recordDetail.collectedLater'),
                        value: <Money paise={r.amountAllocatedPaise} />,
                      }
                    : null,
                  {
                    label: t('record.amountDue'),
                    value: (
                      <Money
                        paise={r.amountDuePaise}
                        className={r.amountDuePaise > 0 ? 'font-bold text-warning' : ''}
                      />
                    ),
                  },
                  r.principalDirection !== 'NONE' && r.principalPaise
                    ? {
                        label:
                          r.principalDirection === 'PAYOUT'
                            ? t('newRecord.paidOutVia')
                            : t('newRecord.principalVia'),
                        value: tk(`method.${r.principalMethod}`),
                      }
                    : null,
                ]}
              />
              {r.postingStatus === 'POSTED' ? (
                <p className="mt-4 flex items-start gap-2 text-sm text-fg-muted">
                  <BookOpen aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {t('record.locked')}
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title={t('common.details')} />
            <div className="p-5">
              <DescList
                items={[
                  {
                    label: t('record.customer'),
                    value: r.customer ? (
                      <Link
                        className="font-semibold text-brand hover:underline"
                        href={`/app/customers/${r.customer.id}`}
                      >
                        {r.customer.name}
                      </Link>
                    ) : (
                      (r.walkInName ?? t('common.walkIn'))
                    ),
                  },
                  {
                    label:
                      r.workflowType === 'APPLICATION'
                        ? t('record.applicationDate')
                        : t('record.txnDate'),
                    value: formatDate(r.txnDate),
                  },
                  ...fields.map((f) => ({
                    key: f.key,
                    label: custom ? f.labelKey : tk(f.labelKey),
                    value: displayValue(f, r.details[f.key]),
                  })),
                  { label: t('record.externalRef'), value: r.externalRef },
                  {
                    label: t('record.followUpDate'),
                    value: r.followUpDate ? formatDate(r.followUpDate) : null,
                  },
                  {
                    label: t('common.notes'),
                    value: r.notes ? <span className="whitespace-pre-line">{r.notes}</span> : null,
                  },
                  { label: t('recordDetail.createdAt'), value: formatDateTime(r.createdAt, tz) },
                ]}
              />
            </div>
          </Card>

          <Timeline r={r} tz={tz} />
          {r.journal.length ? <JournalCard r={r} /> : null}
          {r.allocations.length ? (
            <Card>
              <CardHeader title={t('recordDetail.allocations')} />
              <ul className="divide-y divide-border">
                {r.allocations.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span>
                      {t('dues.receipt', { no: a.receiptNo })} · {formatDate(a.receivedOn)} ·{' '}
                      {tk(`method.${a.method}`)}
                      {a.reversed ? (
                        <Badge tone="warning" className="ml-2">
                          {t('common.reversed')}
                        </Badge>
                      ) : null}
                    </span>
                    <Money
                      paise={a.amountPaise}
                      className={cn('font-semibold', a.reversed && 'line-through')}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader title={t('common.actions')} />
            <div className="flex flex-col gap-4 p-5">
              {canTransition ? (
                <div>
                  <p className="mb-2 text-sm font-semibold text-fg-muted">
                    {t('recordDetail.changeStatus')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {r.allowedTransitions.map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={
                          s === 'FAILED' || s === 'CANCELLED' || s === 'REJECTED'
                            ? 'outline'
                            : 'secondary'
                        }
                        onClick={() => setTransitionTo(s)}
                      >
                        {t('recordDetail.markAs', { status: tk(`status.${s}`) })}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : r.allowedTransitions.length === 0 ? (
                <p className="text-sm text-fg-muted">{t('recordDetail.finalStatus')}</p>
              ) : null}
              {canPostNow ? (
                <Button
                  onClick={() => postM.mutate()}
                  loading={postM.isPending}
                  icon={<BookOpen aria-hidden className="size-4" />}
                >
                  {t('record.post')}
                </Button>
              ) : null}
              {r.postingStatus === 'UNPOSTED' && !isPostableStatus(r.workflowType, r.opStatus) ? (
                <p className="text-sm text-fg-muted">{t('newRecord.notPostable')}</p>
              ) : null}
              {canReverse ? (
                <Button
                  variant="outline"
                  onClick={() => setReverseOpen(true)}
                  icon={<RotateCcw aria-hidden className="size-4" />}
                >
                  {t('record.reverse')}
                </Button>
              ) : null}
              {!canTransition && !canPostNow && !canReverse && r.allowedTransitions.length > 0 ? (
                <p className="text-sm text-fg-muted">{t('recordDetail.noActions')}</p>
              ) : null}
            </div>
          </Card>
          <FollowUpsCard r={r} />
          <AttachmentsCard r={r} />
        </aside>
      </div>

      {transitionTo ? (
        <TransitionDialog
          r={r}
          to={transitionTo}
          onClose={() => setTransitionTo(null)}
          onDone={() => {
            setTransitionTo(null);
            invalidate();
          }}
          onConflict={() => {
            setTransitionTo(null);
            setConflict(true);
          }}
        />
      ) : null}
      <ReverseDialog
        r={r}
        open={reverseOpen}
        onClose={() => setReverseOpen(false)}
        onDone={() => {
          setReverseOpen(false);
          invalidate();
        }}
      />
      <EditDialog
        r={r}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onDone={() => {
          setEditOpen(false);
          invalidate();
        }}
        onConflict={() => {
          setEditOpen(false);
          setConflict(true);
        }}
      />
    </>
  );
}

function Timeline({ r, tz }: { r: RecordDetail; tz: string }) {
  const { t, tk } = useI18n();
  const dimLabel = (d: string) => tk(`timeline.${d}`);
  const statusLabel = (dim: string, s: string | null) => {
    if (!s) return '';
    if (dim === 'OPERATIONAL') return tk(`status.${s}`);
    if (dim === 'PAYMENT') return tk(`payment.${s}`);
    if (dim === 'POSTING') return tk(`posting.${s}`);
    return s;
  };
  return (
    <Card>
      <CardHeader title={t('record.history')} />
      <ol className="flex flex-col gap-0 p-5" data-testid="timeline">
        {r.events.map((e, i) => (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < r.events.length - 1 ? (
              <span
                aria-hidden
                className="absolute top-6 left-[9px] h-[calc(100%-12px)] w-0.5 bg-border"
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                'mt-1 size-5 shrink-0 rounded-full border-4 border-surface',
                e.dimension === 'OPERATIONAL'
                  ? 'bg-brand'
                  : e.dimension === 'POSTING'
                    ? 'bg-brand-alt'
                    : e.dimension === 'PAYMENT'
                      ? 'bg-success'
                      : 'bg-fg-muted',
              )}
            />
            <div className="min-w-0">
              <p className="font-semibold">
                {dimLabel(e.dimension)}
                {e.toStatus ? (
                  <>
                    {': '}
                    {e.fromStatus ? `${statusLabel(e.dimension, e.fromStatus)} → ` : ''}
                    {statusLabel(e.dimension, e.toStatus)}
                  </>
                ) : null}
              </p>
              <p className="text-sm text-fg-muted">
                {formatDateTime(e.createdAt, tz)} · {tk(`actor.${e.actorType}`)}
              </p>
              {e.reason ? (
                <p className="mt-1 text-sm">{t('recordDetail.reason', { reason: e.reason })}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function JournalCard({ r }: { r: RecordDetail }) {
  const { t, tk } = useI18n();
  return (
    <Card>
      <CardHeader title={t('recordDetail.journal')} description={t('recordDetail.journalHelp')} />
      <div className="flex flex-col gap-4 p-5">
        {r.journal.map((j) => (
          <div key={j.id}>
            <p className="mb-1 text-sm font-semibold">
              {t('recordDetail.entry', { no: j.entryNo })} · {formatDate(j.businessDate)} ·{' '}
              {tk(`entryType.${j.type}`)}
              {j.reversedByEntryId ? (
                <Badge tone="warning" className="ml-2">
                  {t('common.reversed')}
                </Badge>
              ) : null}
            </p>
            <div className={tableCls.wrap}>
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-fg-muted">
                    <th className="py-1 font-semibold">{t('ledger.account')}</th>
                    <th className="py-1 text-right font-semibold">{t('ledger.debit')}</th>
                    <th className="py-1 text-right font-semibold">{t('ledger.credit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {j.lines.map((l, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1.5">
                        {tk(`ledger.${l.account}`)}
                        {l.memo ? (
                          <span className="block text-xs text-fg-muted">{l.memo}</span>
                        ) : null}
                      </td>
                      <td className="money py-1.5 text-right">
                        {l.debitPaise ? <Money paise={l.debitPaise} /> : ''}
                      </td>
                      <td className="money py-1.5 text-right">
                        {l.creditPaise ? <Money paise={l.creditPaise} /> : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TransitionDialog({
  r,
  to,
  onClose,
  onDone,
  onConflict,
}: {
  r: RecordDetail;
  to: OpStatus;
  onClose: () => void;
  onDone: () => void;
  onConflict: () => void;
}) {
  const { t, tk } = useI18n();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [askReverse, setAskReverse] = useState(false);
  const errs = useFormErrors();
  const needsReason = transitionNeedsReason(r.opStatus, to);
  const m = useMutation({
    mutationFn: (reversePosting?: boolean) =>
      api(`/v1/records/${r.id}/transitions`, {
        method: 'POST',
        body: {
          version: r.version,
          to,
          reason: reason.trim() || null,
          ...(reversePosting !== undefined ? { reversePosting } : {}),
        },
      }),
    onSuccess: () => {
      toast('success', t('recordDetail.statusChanged', { status: tk(`status.${to}`) }));
      onDone();
    },
    onError: (e) => {
      if (isApiError(e, 'CONFLICT') && e.details.requires === 'reversePosting') setAskReverse(true);
      else if (isApiError(e, 'VERSION_CONFLICT')) onConflict();
      else errs.fromError(e);
    },
  });
  const submit = (reversePosting?: boolean) => {
    errs.clear();
    if (needsReason && reason.trim().length < 1) {
      errs.setFields({ reason: [t('msg.reason')] });
      return;
    }
    m.mutate(reversePosting);
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('recordDetail.markAs', { status: tk(`status.${to}`) })}
      description={to === 'SUCCESSFUL' ? t('recordDetail.successNote') : undefined}
      footer={
        askReverse ? (
          <>
            <Button variant="outline" onClick={() => submit(false)} loading={m.isPending}>
              {t('recordDetail.keepEntries')}
            </Button>
            <Button onClick={() => submit(true)} loading={m.isPending}>
              {t('recordDetail.reverseEntries')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => submit()} loading={m.isPending}>
              {t('common.confirm')}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label={t('recordDetail.reasonLabel')}
          required={needsReason}
          optionalLabel={t('common.optional')}
          error={errs.get('reason')}
        >
          {(p) => (
            <Textarea
              id={p.id}
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid || undefined}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        {askReverse ? (
          <Alert tone="warning" title={t('recordDetail.postedTitle')}>
            <span data-testid="ask-reverse">{t('recordDetail.postedQuestion')}</span>
          </Alert>
        ) : null}
        {errs.formMessage && !errs.get('reason') ? (
          <Alert tone="danger">{errs.formMessage}</Alert>
        ) : null}
      </div>
    </Dialog>
  );
}

function ReverseDialog({
  r,
  open,
  onClose,
  onDone,
}: {
  r: RecordDetail;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const errs = useFormErrors();
  const m = useMutation({
    mutationFn: () =>
      api(`/v1/records/${r.id}/reverse`, { method: 'POST', body: { version: r.version, reason } }),
    onSuccess: () => {
      toast('success', t('record.reversed'));
      onDone();
    },
    onError: errs.fromError,
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('record.reverse')}
      description={t('recordDetail.reverseHelp')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={m.isPending}
            onClick={() => {
              errs.clear();
              if (reason.trim().length < 3) errs.setFields({ reason: [t('msg.reason')] });
              else m.mutate();
            }}
          >
            {t('record.reverse')}
          </Button>
        </>
      }
    >
      <Field label={t('recordDetail.reasonLabel')} required error={errs.get('reason')}>
        {(p) => (
          <Textarea
            id={p.id}
            aria-describedby={p.describedBy}
            aria-invalid={p.invalid || undefined}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </Field>
      {errs.formMessage && !errs.get('reason') ? (
        <Alert tone="danger" className="mt-3">
          {errs.formMessage}
        </Alert>
      ) : null}
    </Dialog>
  );
}

function EditDialog({
  r,
  open,
  onClose,
  onDone,
  onConflict,
}: {
  r: RecordDetail;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  onConflict: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [externalRef, setExternalRef] = useState(r.externalRef ?? '');
  const [notes, setNotes] = useState(r.notes ?? '');
  const [walkIn, setWalkIn] = useState(r.walkInName ?? '');
  const [followUpDate, setFollowUpDate] = useState(r.followUpDate ?? '');
  const errs = useFormErrors();
  const m = useMutation({
    mutationFn: () =>
      api(`/v1/records/${r.id}`, {
        method: 'PATCH',
        body: {
          version: r.version,
          externalRef: externalRef.trim() || null,
          notes: notes.trim() || null,
          followUpDate: followUpDate || null,
          ...(r.customerId ? {} : { walkInName: walkIn.trim() || null }),
        },
      }),
    onSuccess: () => {
      toast('success', t('common.saved'));
      onDone();
    },
    onError: (e) => (isApiError(e, 'VERSION_CONFLICT') ? onConflict() : errs.fromError(e)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('recordDetail.edit')}
      description={t('recordDetail.editHelp')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => m.mutate()} loading={m.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!r.customerId ? (
          <Field label={t('common.walkIn')} error={errs.get('walkInName')}>
            {(p) => (
              <Input
                id={p.id}
                aria-invalid={p.invalid || undefined}
                value={walkIn}
                onChange={(e) => setWalkIn(e.target.value)}
              />
            )}
          </Field>
        ) : null}
        <Field label={t('record.externalRef')} error={errs.get('externalRef')}>
          {(p) => (
            <Input
              id={p.id}
              aria-invalid={p.invalid || undefined}
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('record.followUpDate')} error={errs.get('followUpDate')}>
          {(p) => (
            <Input
              id={p.id}
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('common.notes')} error={errs.get('notes')}>
          {(p) => (
            <Textarea
              id={p.id}
              aria-invalid={p.invalid || undefined}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
        {errs.formMessage && !Object.keys(errs.fields).length ? (
          <Alert tone="danger">{errs.formMessage}</Alert>
        ) : null}
      </div>
    </Dialog>
  );
}

function FollowUpsCard({ r }: { r: RecordDetail }) {
  const { t, tk } = useI18n();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const toast = useToast();
  const today = useToday();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(today);
  const errs = useFormErrors();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['records', 'detail', r.id] });
  const create = useMutation({
    mutationFn: () =>
      api('/v1/follow-ups', {
        method: 'POST',
        body: { title, dueDate, recordId: r.id, customerId: r.customerId },
      }),
    onSuccess: () => {
      toast('success', t('followUps.created'));
      setOpen(false);
      setTitle('');
      refresh();
      void qc.invalidateQueries({ queryKey: ['follow-ups'] });
    },
    onError: errs.fromError,
  });
  const done = useMutation({
    mutationFn: (f: { id: string; version: number }) =>
      api(`/v1/follow-ups/${f.id}`, {
        method: 'PATCH',
        body: { version: f.version, status: 'DONE' },
      }),
    onSuccess: refresh,
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  if (!can('followups.view')) return null;
  return (
    <Card>
      <CardHeader
        title={t('nav.followUps')}
        actions={
          can('followups.manage') ? (
            <Button
              size="sm"
              variant="outline"
              icon={<Plus aria-hidden className="size-4" />}
              onClick={() => setOpen(true)}
            >
              {t('followUps.add')}
            </Button>
          ) : null
        }
      />
      {r.followUps.length === 0 ? (
        <EmptyState
          icon={<CalendarClock aria-hidden className="size-6" />}
          title={t('followUps.none')}
        />
      ) : (
        <ul className="divide-y divide-border">
          {r.followUps.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{f.title}</p>
                <p className="text-sm text-fg-muted">
                  {formatDate(f.dueDate)} · {tk(`followUpStatus.${f.status}`)}
                </p>
              </div>
              {f.status === 'OPEN' && can('followups.manage') ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => done.mutate({ id: f.id, version: f.version })}
                  loading={done.isPending && done.variables?.id === f.id}
                >
                  {t('followUps.markDone')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('followUps.add')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() =>
                title.trim().length < 2
                  ? errs.setFields({ title: [t('msg.tooShort')] })
                  : create.mutate()
              }
              loading={create.isPending}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={t('followUps.title')} required error={errs.get('title')}>
            {(p) => (
              <Input
                id={p.id}
                aria-invalid={p.invalid || undefined}
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('followUps.dueDate')} required error={errs.get('dueDate')}>
            {(p) => (
              <Input
                id={p.id}
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            )}
          </Field>
          {errs.formMessage && !Object.keys(errs.fields).length ? (
            <Alert tone="danger">{errs.formMessage}</Alert>
          ) : null}
        </div>
      </Dialog>
    </Card>
  );
}

function AttachmentsCard({ r }: { r: RecordDetail }) {
  const { t } = useI18n();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('ownerType', 'RECORD');
      fd.set('ownerId', r.id);
      await api('/v1/attachments', { method: 'POST', formData: fd });
      toast('success', t('attachments.uploaded'));
      void qc.invalidateQueries({ queryKey: ['records', 'detail', r.id] });
    } catch (e) {
      toast('error', errorMessage(t, e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const canUpload = can('attachments.upload') && can('records.edit');
  return (
    <Card>
      <CardHeader
        title={t('attachments.title')}
        description={t('attachments.help')}
        actions={
          canUpload ? (
            <>
              <input
                ref={input}
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                className="sr-only"
                id={`upload-${r.id}`}
                onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
              />
              <Button
                size="sm"
                variant="outline"
                loading={busy}
                icon={<Upload aria-hidden className="size-4" />}
                onClick={() => input.current?.click()}
              >
                {t('attachments.upload')}
              </Button>
            </>
          ) : null
        }
      />
      {r.attachments.length === 0 ? (
        <EmptyState
          icon={<Paperclip aria-hidden className="size-6" />}
          title={t('attachments.none')}
        />
      ) : (
        <ul className="divide-y divide-border">
          {r.attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-3">
              <Paperclip aria-hidden className="size-4 text-fg-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.fileName}</span>
                <span className="block text-xs text-fg-muted">
                  {Math.ceil(a.sizeBytes / 1024)} KB ·{' '}
                  {a.scanStatus === 'PENDING'
                    ? t('attachments.scanning')
                    : a.scanStatus === 'INFECTED'
                      ? t('attachments.blocked')
                      : t('attachments.ready')}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('attachments.download', { name: a.fileName })}
                disabled={a.scanStatus === 'INFECTED'}
                onClick={() =>
                  openSignedUrl(`/v1/attachments/${a.id}/url`).catch((e) =>
                    toast('error', errorMessage(t, e)),
                  )
                }
              >
                <Download aria-hidden className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
