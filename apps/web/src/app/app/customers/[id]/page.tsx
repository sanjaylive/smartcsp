'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, HandCoins, Pencil, Plus, Send, UserRound } from 'lucide-react';
import { formatDate, formatDateTime } from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorMessage, usePermissions } from '@/lib/hooks';
import type { CustomerDetail } from '@/lib/types';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  DescList,
  EmptyState,
  Money,
  PageHeader,
  tableCls,
} from '@/components/ui';
import { QueryState } from '@/components/query-state';
import { CustomerDialog } from '@/components/customer-form';
import { PaymentBadge, ServiceName, StatusBadge } from '@/components/service';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, tk } = useI18n();
  const { can, ctx } = usePermissions();
  const qc = useQueryClient();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const q = useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: () => api<CustomerDetail>(`/v1/customers/${id}`),
  });
  const archive = useMutation({
    mutationFn: () => api(`/v1/customers/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
      toast('success', t('common.saved'));
    },
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  const remind = useMutation({
    mutationFn: () => api(`/v1/customers/${id}/remind`, { method: 'POST', body: {} }),
    onSuccess: () => toast('success', t('customer.reminderSent')),
    onError: (e) => toast('error', errorMessage(t, e)),
  });

  return (
    <QueryState query={q} rows={5}>
      {(c) => (
        <>
          <PageHeader
            icon={
              <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-bg text-brand-strong dark:text-fg">
                <UserRound aria-hidden className="size-6" />
              </span>
            }
            title={c.name}
            description={
              c.archivedAt ? (
                <Badge>{t('customer.archived')}</Badge>
              ) : (
                t('customers.since', { date: formatDateTime(c.createdAt, ctx?.tenant.timezone) })
              )
            }
            actions={
              <>
                {can('records.create') && !c.archivedAt ? (
                  <ButtonLink
                    href="/app/records/new"
                    icon={<Plus aria-hidden className="size-4" />}
                  >
                    {t('nav.newRecord')}
                  </ButtonLink>
                ) : null}
                {can('customers.manage') ? (
                  <>
                    {c.phone && !c.archivedAt ? (
                      <Button
                        variant="outline"
                        loading={remind.isPending}
                        icon={<Send aria-hidden className="size-4" />}
                        onClick={() => remind.mutate()}
                      >
                        {t('customer.sendReminder')}
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      icon={<Pencil aria-hidden className="size-4" />}
                      onClick={() => setEdit(true)}
                    >
                      {t('common.edit')}
                    </Button>
                    <Button
                      variant="outline"
                      loading={archive.isPending}
                      icon={
                        c.archivedAt ? (
                          <ArchiveRestore aria-hidden className="size-4" />
                        ) : (
                          <Archive aria-hidden className="size-4" />
                        )
                      }
                      onClick={() => archive.mutate()}
                    >
                      {c.archivedAt ? t('customers.restore') : t('common.archive')}
                    </Button>
                  </>
                ) : null}
              </>
            }
          />
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader title={t('common.details')} />
                <div className="p-5">
                  <DescList
                    items={[
                      {
                        label: t('customer.phone'),
                        value: c.phone ? (
                          <span className="money">
                            {c.phone}
                            {c.phoneMasked ? ` (${t('record.masked')})` : ''}
                          </span>
                        ) : null,
                      },
                      { label: t('customer.email'), value: c.email },
                      {
                        label: t('customer.followUpPreference'),
                        value: tk(`followUpPref.${c.followUpPreference}`),
                      },
                      {
                        label: t('common.notes'),
                        value: c.notes ? (
                          <span className="whitespace-pre-line">{c.notes}</span>
                        ) : null,
                      },
                    ]}
                  />
                </div>
              </Card>
              <Card>
                <CardHeader
                  title={t('customer.history')}
                  description={t('customers.historyHelp')}
                />
                {c.history.length === 0 ? (
                  <EmptyState title={t('customers.noHistory')} />
                ) : (
                  <div className={tableCls.wrap}>
                    <table className={tableCls.table}>
                      <thead>
                        <tr>
                          <th className={tableCls.th}>#</th>
                          <th className={tableCls.th}>{t('common.date')}</th>
                          <th className={tableCls.th}>{t('records.service')}</th>
                          <th className={tableCls.th}>{t('common.status')}</th>
                          <th className={tableCls.th}>{t('records.payment')}</th>
                          <th className={cn(tableCls.th, 'text-right')}>{t('record.amountDue')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.history.map((r) => (
                          <tr key={r.id}>
                            <td className={tableCls.td}>
                              <Link
                                href={`/app/records/${r.id}`}
                                className="font-semibold text-brand hover:underline"
                              >
                                #{r.recordNo}
                              </Link>
                            </td>
                            <td className={cn(tableCls.td, 'whitespace-nowrap')}>
                              {formatDate(r.txnDate)}
                            </td>
                            <td className={tableCls.td}>
                              <ServiceName code={r.serviceCode} />
                            </td>
                            <td className={tableCls.td}>
                              <StatusBadge status={r.opStatus} />
                            </td>
                            <td className={tableCls.td}>
                              <PaymentBadge status={r.paymentStatus} />
                            </td>
                            <td className={cn(tableCls.td, tableCls.num)}>
                              <Money paise={r.amountDuePaise} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
            <aside className="flex flex-col gap-6">
              <Card className="p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-fg-muted">
                  <HandCoins aria-hidden className="size-4" />
                  {t('customer.dues')}
                </p>
                <p
                  className={cn(
                    'money mt-1 text-3xl font-extrabold',
                    c.outstandingDuePaise > 0 && 'text-warning',
                  )}
                  data-testid="customer-due"
                >
                  <Money paise={c.outstandingDuePaise} />
                </p>
                <p className="mt-1 text-[13px] text-fg-muted">{t('customers.duesHelp')}</p>
                {c.outstandingDuePaise > 0 && can('dues.collect') ? (
                  <ButtonLink
                    href={`/app/dues?customer=${c.id}`}
                    variant="secondary"
                    className="mt-3 w-full"
                  >
                    {t('dues.collect')}
                  </ButtonLink>
                ) : null}
              </Card>
              <Card>
                <CardHeader title={t('dashboard.followUpsDue')} />
                {c.followUps.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-fg-muted">{t('followUps.none')}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {c.followUps.map((f) => (
                      <li key={f.id} className="px-5 py-3">
                        <p className="font-medium">{f.title}</p>
                        <p className="text-sm text-fg-muted">{formatDate(f.dueDate)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              {c.archivedAt ? <Alert tone="info">{t('customers.archivedHelp')}</Alert> : null}
            </aside>
          </div>
          {edit ? (
            <CustomerDialog
              open
              existing={c}
              onClose={() => setEdit(false)}
              onSaved={() => {
                setEdit(false);
                toast('success', t('common.saved'));
                void qc.invalidateQueries({ queryKey: ['customers'] });
              }}
            />
          ) : null}
        </>
      )}
    </QueryState>
  );
}
