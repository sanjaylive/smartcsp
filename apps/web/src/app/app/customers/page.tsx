'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/hooks';
import type { Customer, Page } from '@/lib/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Money,
  PageHeader,
  tableCls,
} from '@/components/ui';
import { QueryState } from '@/components/query-state';
import { Pagination } from '@/components/pagination';
import { CustomerDialog } from '@/components/customer-form';
import { useDebounced } from '@/components/customer-picker';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

function CustomersInner() {
  const { t } = useI18n();
  const { can } = usePermissions();
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [term, setTerm] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const q = useDebounced(term, 300);
  useEffect(() => setPage(1), [q, archived]);
  useEffect(() => {
    if (sp.get('new') && can('customers.manage')) setOpen(true);
  }, [sp, can]);
  const query = useQuery({
    queryKey: ['customers', 'list', q, archived, page],
    queryFn: () =>
      api<Page<Customer>>('/v1/customers', {
        query: { q, archived: archived ? 'true' : undefined, page, pageSize: 25 },
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title={t('customer.title')}
        description={t('customers.help')}
        actions={
          can('customers.manage') ? (
            <Button
              icon={<UserPlus aria-hidden className="size-4" />}
              onClick={() => setOpen(true)}
            >
              {t('customer.new')}
            </Button>
          ) : null
        }
      />
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-60 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
          />
          <Input
            aria-label={t('customers.searchLabel')}
            placeholder={t('customers.searchPlaceholder')}
            className="pl-9"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <div
          role="group"
          aria-label={t('customers.show')}
          className="flex rounded-[10px] border border-border p-1"
        >
          {[false, true].map((a) => (
            <button
              key={String(a)}
              type="button"
              aria-pressed={archived === a}
              onClick={() => setArchived(a)}
              className={cn(
                'min-h-9 rounded-lg px-3 text-sm font-semibold',
                archived === a ? 'bg-brand text-on-brand' : 'text-fg-muted hover:bg-surface-muted',
              )}
            >
              {a ? t('customer.archived') : t('customers.active')}
            </button>
          ))}
        </div>
      </Card>
      <QueryState query={query} rows={5}>
        {(data) =>
          data.items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Users aria-hidden className="size-6" />}
                title={q ? t('customers.noMatch') : t('customers.empty')}
                description={q ? undefined : t('customers.emptyHelp')}
              />
            </Card>
          ) : (
            <Card>
              <div className={tableCls.wrap}>
                <table className={cn(tableCls.table, 'min-w-[520px]')}>
                  <caption className="sr-only">{t('customer.title')}</caption>
                  <thead>
                    <tr>
                      <th className={tableCls.th}>{t('customer.name')}</th>
                      <th className={tableCls.th}>{t('customer.phone')}</th>
                      <th className={cn(tableCls.th, 'text-right')}>{t('customer.dues')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((c) => (
                      <tr key={c.id} className="hover:bg-surface-muted/50">
                        <td className={tableCls.td}>
                          <Link
                            href={`/app/customers/${c.id}`}
                            className="font-semibold text-brand hover:underline"
                          >
                            {c.name}
                          </Link>
                          {c.archivedAt ? (
                            <Badge className="ml-2">{t('customer.archived')}</Badge>
                          ) : null}
                        </td>
                        <td className={cn(tableCls.td, 'money')}>{c.phone ?? '—'}</td>
                        <td className={cn(tableCls.td, tableCls.num)}>
                          {c.outstandingDuePaise ? (
                            <Money
                              paise={c.outstandingDuePaise}
                              className="font-semibold text-warning"
                            />
                          ) : (
                            <Money paise={0} className="text-fg-muted" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
            </Card>
          )
        }
      </QueryState>
      {open ? (
        <CustomerDialog
          open
          onClose={() => {
            setOpen(false);
            if (sp.get('new')) router.replace('/app/customers');
          }}
          onSaved={(c) => {
            setOpen(false);
            toast('success', t('customers.created', { name: c.name }));
            void qc.invalidateQueries({ queryKey: ['customers'] });
            router.push(`/app/customers/${c.id}`);
          }}
        />
      ) : null}
    </>
  );
}

export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersInner />
    </Suspense>
  );
}
