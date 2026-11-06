'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Guard } from '@/components/guard';
import {
  Card,
  Empty,
  Input,
  PageHeader,
  Pagination,
  QueryState,
  Select,
  StatusBadge,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { get } from '@/lib/api';
import { dt } from '@/lib/format';
import type { Page, TenantRow } from '@/lib/types';

export default function TenantsPage() {
  return (
    <Guard perm="platform.view" what="tenants">
      <TenantsInner />
    </Guard>
  );
}

function TenantsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get('status') ?? '';
  const qParam = params.get('q') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;
  const [text, setText] = useState(qParam);

  const setParams = (next: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    router.replace(`/tenants${sp.size ? `?${sp}` : ''}`);
  };

  // Debounced search-as-you-type.
  useEffect(() => {
    if (text === qParam) return;
    const t = setTimeout(() => setParams({ q: text.trim(), page: '' }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const q = useQuery({
    queryKey: ['tenants', qParam, status, page],
    queryFn: () =>
      get<Page<TenantRow>>('/v1/admin/tenants', { q: qParam, status, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Search shops by name, district or tenant ID. Tenant details never include customer or record data — use a support session for that."
      />
      <Card bodyClassName="p-0">
        <form
          role="search"
          className="flex flex-wrap items-end gap-2 border-b border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            setParams({ q: text.trim(), page: '' });
          }}
        >
          <div className="relative min-w-[220px] flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-fg-muted"
              aria-hidden
            />
            <Input
              aria-label="Search tenants"
              placeholder="Shop name, district or tenant ID"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="pl-8"
              type="search"
            />
          </div>
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setParams({ status: e.target.value, page: '' })}
            className="w-auto"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="PENDING_DELETION">Pending deletion</option>
          </Select>
        </form>
        <QueryState query={q}>
          {(data) =>
            data.items.length === 0 ? (
              <Empty title="No tenants match">Try a different name, district or status.</Empty>
            ) : (
              <>
                <Table label="Tenants">
                  <thead>
                    <tr>
                      <Th>Shop</Th>
                      <Th>Owner</Th>
                      <Th>Location</Th>
                      <Th>Status</Th>
                      <Th>Plan</Th>
                      <Th>Created</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((t) => (
                      <tr key={t.id} className="hover:bg-muted/50">
                        <Td>
                          <Link
                            href={`/tenants/${t.id}`}
                            className="font-medium text-brand hover:underline"
                          >
                            {t.name}
                          </Link>
                          <div className="font-mono text-[11px] text-fg-muted">{t.id}</div>
                        </Td>
                        <Td>{t.ownerDisplayName}</Td>
                        <Td>
                          {t.district}, {t.state}
                        </Td>
                        <Td>
                          <StatusBadge status={t.status} />
                        </Td>
                        <Td>
                          {t.plan ?? '—'}
                          {t.subscriptionStatus && (
                            <div className="text-xs text-fg-muted">{t.subscriptionStatus}</div>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap">{dt(t.createdAt)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <Pagination
                  page={data.page}
                  pages={data.pages}
                  total={data.total}
                  onPage={(p) => setParams({ page: String(p) })}
                />
              </>
            )
          }
        </QueryState>
      </Card>
    </>
  );
}
