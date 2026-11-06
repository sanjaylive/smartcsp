'use client';

import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { History, LifeBuoy } from 'lucide-react';
import { formatDateTime } from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/hooks';
import type { AuditEvent, Page } from '@/lib/types';
import { Badge, Card, EmptyState, Field, PageHeader, Select, tableCls } from '@/components/ui';
import { QueryState } from '@/components/query-state';
import { Pagination } from '@/components/pagination';
import { useDebounced } from '@/components/customer-picker';
import { cn } from '@/lib/cn';

const PREFIXES = [
  '',
  'record.',
  'customer.',
  'collection.',
  'expense.',
  'cashbook.',
  'commission.',
  'day.',
  'staff.',
  'service.',
  'tenant.',
  'subscription.',
  'export.',
  'attachment.',
  'connector.',
  'support.',
];

export default function AuditPage() {
  const { t, tk } = useI18n();
  const { ctx } = usePermissions();
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const a = useDebounced(action, 200);
  const q = useQuery({
    queryKey: ['audit', a, page],
    queryFn: () =>
      api<Page<AuditEvent>>('/v1/audit', { query: { action: a || undefined, page, pageSize: 30 } }),
    placeholderData: keepPreviousData,
  });
  const targetLink = (e: AuditEvent) =>
    e.targetType === 'record' && e.targetId
      ? `/app/records/${e.targetId}`
      : e.targetType === 'customer' && e.targetId
        ? `/app/customers/${e.targetId}`
        : null;
  return (
    <>
      <PageHeader title={t('nav.audit')} description={t('audit.help')} />
      <Card className="mb-4 p-4">
        <Field label={t('audit.filter')}>
          {(p) => (
            <Select
              id={p.id}
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              className="max-w-xs"
            >
              {PREFIXES.map((x) => (
                <option key={x} value={x}>
                  {x ? tk(`auditGroup.${x.slice(0, -1)}`) : t('common.all')}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Card>
      <QueryState query={q}>
        {(d) =>
          d.items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<History aria-hidden className="size-6" />}
                title={t('audit.none')}
              />
            </Card>
          ) : (
            <Card>
              <div className={tableCls.wrap}>
                <table className={tableCls.table}>
                  <thead>
                    <tr>
                      <th className={tableCls.th}>{t('audit.when')}</th>
                      <th className={tableCls.th}>{t('audit.who')}</th>
                      <th className={tableCls.th}>{t('audit.action')}</th>
                      <th className={tableCls.th}>{t('audit.target')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((e) => {
                      const link = targetLink(e);
                      return (
                        <tr
                          key={e.id}
                          className={cn(e.actorType === 'SUPPORT' && 'bg-warning-bg/50')}
                        >
                          <td className={cn(tableCls.td, 'text-sm whitespace-nowrap')}>
                            {formatDateTime(e.createdAt, ctx?.tenant.timezone)}
                          </td>
                          <td className={tableCls.td}>
                            {e.actorType === 'SUPPORT' ? (
                              <Badge
                                tone="warning"
                                icon={<LifeBuoy aria-hidden className="size-3.5" />}
                              >
                                {t('audit.support')}
                              </Badge>
                            ) : (
                              e.actor
                            )}
                          </td>
                          <td className={tableCls.td}>
                            {tk(`auditAction.${e.action}`) !== `auditAction.${e.action}` ? (
                              <>
                                <span className="block font-medium">
                                  {tk(`auditAction.${e.action}`)}
                                </span>
                                <span className="block font-mono text-xs text-fg-muted">
                                  {e.action}
                                </span>
                              </>
                            ) : (
                              <span className="block font-mono text-sm">{e.action}</span>
                            )}
                          </td>
                          <td className={cn(tableCls.td, 'text-sm')}>
                            {e.targetType ? (
                              link ? (
                                <Link href={link} className="text-brand hover:underline">
                                  {tk(`targetType.${e.targetType}`)}
                                </Link>
                              ) : (
                                tk(`targetType.${e.targetType}`)
                              )
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={d.page} pages={d.pages} total={d.total} onPage={setPage} />
            </Card>
          )
        }
      </QueryState>
    </>
  );
}
