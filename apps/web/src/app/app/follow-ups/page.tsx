'use client';

import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Plus } from 'lucide-react';
import { followUpCreateSchema, formatDate } from '@csp2all/shared';
import { api, isApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  errorMessage,
  useFormErrors,
  usePermissions,
  useToday,
  zodToFieldErrors,
} from '@/lib/hooks';
import type { FollowUp, Page } from '@/lib/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Textarea,
} from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { QueryState } from '@/components/query-state';
import { Pagination } from '@/components/pagination';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

const STATUSES = ['OPEN', 'DONE', 'CANCELLED'] as const;

export default function FollowUpsPage() {
  const { t, tk } = useI18n();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const toast = useToast();
  const today = useToday();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('OPEN');
  const [dueOnly, setDueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['follow-ups', status, dueOnly, page],
    queryFn: () =>
      api<Page<FollowUp>>('/v1/follow-ups', {
        query: { status, dueBy: dueOnly ? today : undefined, page, pageSize: 25 },
      }),
    placeholderData: keepPreviousData,
  });
  const update = useMutation({
    mutationFn: (v: { f: FollowUp; status: FollowUp['status'] }) =>
      api(`/v1/follow-ups/${v.f.id}`, {
        method: 'PATCH',
        body: { version: v.f.version, status: v.status },
      }),
    onSuccess: () => {
      toast('success', t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['follow-ups'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) =>
      toast(
        'error',
        isApiError(e, 'VERSION_CONFLICT') ? t('error.VERSION_CONFLICT') : errorMessage(t, e),
      ),
  });

  return (
    <>
      <PageHeader
        title={t('nav.followUps')}
        description={t('followUps.help')}
        actions={
          can('followups.manage') ? (
            <Button icon={<Plus aria-hidden className="size-4" />} onClick={() => setOpen(true)}>
              {t('followUps.add')}
            </Button>
          ) : null
        }
      />
      <Card className="mb-4 flex flex-wrap items-center gap-4 p-4">
        <div
          role="tablist"
          aria-label={t('common.status')}
          className="flex rounded-[10px] border border-border p-1"
        >
          {STATUSES.map((s) => (
            <button
              key={s}
              role="tab"
              type="button"
              aria-selected={status === s}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
              className={cn(
                'min-h-9 rounded-lg px-3 text-sm font-semibold',
                status === s ? 'bg-brand text-on-brand' : 'text-fg-muted hover:bg-surface-muted',
              )}
            >
              {tk(`followUpStatus.${s}`)}
            </button>
          ))}
        </div>
        {status === 'OPEN' ? (
          <Checkbox
            label={t('followUps.dueOnly')}
            checked={dueOnly}
            onChange={(v) => {
              setDueOnly(v);
              setPage(1);
            }}
          />
        ) : null}
      </Card>
      <QueryState query={query}>
        {(data) =>
          data.items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<CalendarClock aria-hidden className="size-6" />}
                title={t('followUps.none')}
              />
            </Card>
          ) : (
            <Card>
              <ul className="divide-y divide-border">
                {data.items.map((f) => {
                  const overdue = f.status === 'OPEN' && f.dueDate < today;
                  const dueToday = f.status === 'OPEN' && f.dueDate === today;
                  return (
                    <li key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {f.recordId ? (
                            <Link className="hover:underline" href={`/app/records/${f.recordId}`}>
                              {f.title}
                            </Link>
                          ) : (
                            f.title
                          )}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                          {overdue ? (
                            <Badge tone="danger">{t('followUps.overdue')}</Badge>
                          ) : dueToday ? (
                            <Badge tone="warning">{t('followUps.dueToday')}</Badge>
                          ) : null}
                          <span>{formatDate(f.dueDate)}</span>
                          {f.customer ? (
                            <Link
                              href={`/app/customers/${f.customer.id}`}
                              className="hover:underline"
                            >
                              · {f.customer.name}
                            </Link>
                          ) : null}
                        </p>
                        {f.notes ? <p className="mt-1 text-sm">{f.notes}</p> : null}
                      </div>
                      {can('followups.manage') ? (
                        <div className="flex gap-2">
                          {f.status === 'OPEN' ? (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => update.mutate({ f, status: 'DONE' })}
                              >
                                {t('followUps.markDone')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => update.mutate({ f, status: 'CANCELLED' })}
                              >
                                {t('common.cancel')}
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => update.mutate({ f, status: 'OPEN' })}
                            >
                              {t('followUps.reopen')}
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
            </Card>
          )
        }
      </QueryState>
      {open ? <CreateFollowUp onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CreateFollowUp({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const today = useToday();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(today);
  const [notes, setNotes] = useState('');
  const errs = useFormErrors();
  const m = useMutation({
    mutationFn: (body: unknown) => api('/v1/follow-ups', { method: 'POST', body }),
    onSuccess: () => {
      toast('success', t('followUps.created'));
      void qc.invalidateQueries({ queryKey: ['follow-ups'] });
      onClose();
    },
    onError: errs.fromError,
  });
  const submit = () => {
    errs.clear();
    const body = { title, dueDate, notes: notes.trim() || null };
    const r = followUpCreateSchema.safeParse(body);
    if (!r.success) return errs.setFields(zodToFieldErrors(r.error));
    m.mutate(body);
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('followUps.add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={m.isPending}>
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
              aria-describedby={p.describedBy}
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
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          )}
        </Field>
        <Field
          label={t('common.notes')}
          optionalLabel={t('common.optional')}
          error={errs.get('notes')}
        >
          {(p) => (
            <Textarea id={p.id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </Field>
        {errs.formMessage && !Object.keys(errs.fields).length ? (
          <Alert tone="danger">{errs.formMessage}</Alert>
        ) : null}
      </div>
    </Dialog>
  );
}
