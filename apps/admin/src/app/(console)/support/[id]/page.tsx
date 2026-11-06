'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { use, useState } from 'react';
import { OP_STATUSES, SERVICE_CODES } from '@csp2all/shared';
import { Guard } from '@/components/guard';
import {
  Badge,
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
import { formatINR, humanize } from '@/lib/format';
import type { Page, SupportRecord } from '@/lib/types';
import { SessionHeader, useSession } from './session-header';

export default function SupportRecordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Guard perm="support.access" what="support sessions">
      <PageHeader
        back={{ href: '/support', label: 'Support sessions' }}
        title="Shop records (read-only)"
      />
      <SessionHeader id={id} />
      <RecordsList id={id} />
    </Guard>
  );
}

function RecordsList({ id }: { id: string }) {
  const { active, loading } = useSession(id);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [service, setService] = useState('');
  const [status, setStatus] = useState('');
  const query = useQuery({
    queryKey: ['support-records', id, page, q, service, status],
    queryFn: () =>
      get<Page<SupportRecord>>(`/v1/admin/support-sessions/${id}/records`, {
        page,
        pageSize: 25,
        q,
        service,
        status,
      }),
    enabled: active,
    placeholderData: keepPreviousData,
  });
  if (loading) return null;
  if (!active)
    return (
      <Empty title="This session is no longer active">
        Records can only be viewed during an active support session. Start a new session if you
        still need access.
      </Empty>
    );
  return (
    <Card bodyClassName="p-0">
      <div className="flex flex-wrap gap-2 border-b border-line p-3" role="search">
        <Input
          aria-label="Search records"
          placeholder="Record no., reference or customer"
          className="min-w-[200px] flex-1"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          type="search"
        />
        <Select
          aria-label="Service"
          className="w-auto"
          value={service}
          onChange={(e) => {
            setService(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All services</option>
          {SERVICE_CODES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Status"
          className="w-auto"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {OP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </div>
      <QueryState query={query} loadingLabel="Loading records…">
        {(d) =>
          d.items.length === 0 ? (
            <Empty title="No records found">This shop has no records matching these filters.</Empty>
          ) : (
            <>
              <Table label="Shop records (read-only)">
                <thead>
                  <tr>
                    <Th>No.</Th>
                    <Th>Date</Th>
                    <Th>Service</Th>
                    <Th>Customer</Th>
                    <Th>Status</Th>
                    <Th>Payment</Th>
                    <Th className="text-right">Amount</Th>
                    <Th className="text-right">Due</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/50" data-testid="support-record-row">
                      <Td>
                        <Link
                          href={`/support/${id}/records/${r.id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          #{r.recordNo}
                        </Link>
                      </Td>
                      <Td className="whitespace-nowrap">{r.txnDate}</Td>
                      <Td>
                        {humanize(r.serviceCode)}
                        {r.isManual && (
                          <Badge className="ml-1" tone="neutral">
                            Manual
                          </Badge>
                        )}
                      </Td>
                      <Td>{r.customer?.name ?? r.walkInName ?? '—'}</Td>
                      <Td>
                        <StatusBadge status={r.opStatus} />
                      </Td>
                      <Td>
                        <StatusBadge status={r.paymentStatus} />
                      </Td>
                      <Td className="tabular text-right">
                        {formatINR(r.principalPaise + r.customerFeePaise)}
                      </Td>
                      <Td className="tabular text-right">{formatINR(r.amountDuePaise)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination page={d.page} pages={d.pages} total={d.total} onPage={setPage} />
            </>
          )
        }
      </QueryState>
    </Card>
  );
}
