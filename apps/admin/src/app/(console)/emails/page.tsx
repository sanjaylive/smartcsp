'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Guard } from '@/components/guard';
import {
  Card,
  Empty,
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
import { dt, humanize } from '@/lib/format';
import type { EmailLog, Page } from '@/lib/types';

export default function EmailsPage() {
  return (
    <Guard perm="platform.view" what="email delivery">
      <EmailsInner />
    </Guard>
  );
}

function EmailsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;
  const set = (next: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    router.replace(`/emails${sp.size ? `?${sp}` : ''}`);
  };
  const q = useQuery({
    queryKey: ['emails', status, page],
    queryFn: () => get<Page<EmailLog>>('/v1/admin/email-logs', { status, page, pageSize: 50 }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  return (
    <>
      <PageHeader
        title="Email delivery"
        description="Transactional email (sign-in codes, invitations, payment updates). Recipients are masked; sign-in codes are never stored."
      />
      <Card bodyClassName="p-0">
        <div className="border-b border-line p-3">
          <Select
            aria-label="Filter by delivery status"
            className="w-auto"
            value={status}
            onChange={(e) => set({ status: e.target.value, page: '' })}
          >
            <option value="">All statuses</option>
            <option value="QUEUED">Queued</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
          </Select>
        </div>
        <QueryState query={q}>
          {(d) =>
            d.items.length === 0 ? (
              <Empty title="No emails match" />
            ) : (
              <>
                <Table label="Email log">
                  <thead>
                    <tr>
                      <Th>Created</Th>
                      <Th>Template</Th>
                      <Th>Recipient</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Attempts</Th>
                      <Th>Sent</Th>
                      <Th>Error</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((e) => (
                      <tr key={e.id}>
                        <Td className="whitespace-nowrap">{dt(e.createdAt)}</Td>
                        <Td>{humanize(e.template)}</Td>
                        <Td className="font-mono text-[12px]">{e.toMasked}</Td>
                        <Td>
                          <StatusBadge status={e.status} />
                        </Td>
                        <Td className="tabular text-right">{e.attempts}</Td>
                        <Td className="whitespace-nowrap">{dt(e.sentAt)}</Td>
                        <Td className="max-w-[300px] text-xs text-danger">{e.error ?? ''}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <Pagination
                  page={d.page}
                  pages={d.pages}
                  total={d.total}
                  onPage={(p) => set({ page: String(p) })}
                />
              </>
            )
          }
        </QueryState>
      </Card>
    </>
  );
}
