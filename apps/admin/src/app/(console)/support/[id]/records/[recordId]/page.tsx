'use client';

import { useQuery } from '@tanstack/react-query';
import { use } from 'react';
import { Guard } from '@/components/guard';
import {
  Badge,
  Card,
  DescList,
  Empty,
  PageHeader,
  QueryState,
  StatusBadge,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { get } from '@/lib/api';
import { dt, formatINR, humanize } from '@/lib/format';
import type { SupportRecordDetail } from '@/lib/types';
import { SessionHeader, useSession } from '../../session-header';

export default function SupportRecordPage({
  params,
}: {
  params: Promise<{ id: string; recordId: string }>;
}) {
  const { id, recordId } = use(params);
  return (
    <Guard perm="support.access" what="support sessions">
      <PageHeader
        back={{ href: `/support/${id}`, label: 'Shop records' }}
        title="Record (read-only)"
      />
      <SessionHeader id={id} />
      <RecordDetail id={id} recordId={recordId} />
    </Guard>
  );
}

function RecordDetail({ id, recordId }: { id: string; recordId: string }) {
  const { active, loading } = useSession(id);
  const q = useQuery({
    queryKey: ['support-record', id, recordId],
    queryFn: () => get<SupportRecordDetail>(`/v1/admin/support-sessions/${id}/records/${recordId}`),
    enabled: active,
  });
  if (loading) return null;
  if (!active)
    return (
      <Empty title="This session is no longer active">
        Records can only be viewed during an active support session.
      </Empty>
    );
  return (
    <QueryState query={q} loadingLabel="Loading record…">
      {(r) => (
        <div className="grid gap-4 xl:grid-cols-3" data-testid="support-record-detail">
          <div className="flex flex-col gap-4 xl:col-span-2">
            <Card
              title={
                <span className="flex items-center gap-2">
                  Record #{r.recordNo} · {humanize(r.serviceCode)}
                  {r.isManual && <Badge>Operator-reported</Badge>}
                </span>
              }
            >
              <DescList
                items={[
                  ['Date', r.txnDate],
                  ['Customer', r.customer?.name ?? r.walkInName ?? '—'],
                  ['Status', <StatusBadge key="s" status={r.opStatus} />],
                  ['Payment', <StatusBadge key="p" status={r.paymentStatus} />],
                  ['Posting', <StatusBadge key="po" status={r.postingStatus} />],
                  ['Connector', humanize(r.connectorStatus)],
                  ['Principal', formatINR(r.principalPaise)],
                  ['Customer fee', formatINR(r.customerFeePaise)],
                  ['Expected commission', formatINR(r.expectedCommissionPaise)],
                  [
                    'Collected',
                    `${formatINR(r.amountCollectedPaise)} (${humanize(r.paymentMethod)})`,
                  ],
                  ['Due', formatINR(r.amountDuePaise)],
                  ['Reference', r.externalRef ?? '—'],
                  ['Source', humanize(r.source)],
                  ['Notes', r.notes ?? '—'],
                ]}
              />
            </Card>
            <Card title="Service details">
              {Object.keys(r.details ?? {}).length === 0 ? (
                <p className="text-[13px] text-fg-muted">No service-specific details.</p>
              ) : (
                <DescList
                  items={Object.entries(r.details).map(([k, v]) => [
                    humanize(k.replace(/([A-Z])/g, '_$1')),
                    typeof v === 'object' ? JSON.stringify(v) : String(v),
                  ])}
                />
              )}
              <p className="mt-2 text-xs text-fg-muted">
                Sensitive identifiers are masked during support access.
              </p>
            </Card>
            <Card title="Ledger entries" bodyClassName="p-0">
              {r.journal.length === 0 ? (
                <Empty title="Not posted to the cashbook" />
              ) : (
                <Table label="Ledger entries">
                  <thead>
                    <tr>
                      <Th>Entry</Th>
                      <Th>Account</Th>
                      <Th className="text-right">Debit</Th>
                      <Th className="text-right">Credit</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.journal.flatMap((e) =>
                      e.lines.map((l, i) => (
                        <tr key={`${e.id}-${i}`}>
                          <Td>
                            {i === 0
                              ? `#${e.entryNo} ${humanize(e.type)} · ${e.businessDate ?? ''}`
                              : ''}
                          </Td>
                          <Td>{l.accountName}</Td>
                          <Td className="tabular text-right">
                            {l.debitPaise ? formatINR(l.debitPaise) : ''}
                          </Td>
                          <Td className="tabular text-right">
                            {l.creditPaise ? formatINR(l.creditPaise) : ''}
                          </Td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
          <div className="flex flex-col gap-4">
            <Card title="Status history">
              {r.events.length === 0 ? (
                <p className="text-[13px] text-fg-muted">No status changes.</p>
              ) : (
                <ol className="flex flex-col gap-2 text-[13px]">
                  {r.events.map((e) => (
                    <li key={e.id}>
                      <div>
                        {humanize(e.dimension)}:{' '}
                        {e.fromStatus ? `${humanize(e.fromStatus)} → ` : ''}
                        <strong>{humanize(e.toStatus)}</strong>
                      </div>
                      <div className="text-xs text-fg-muted">
                        {dt(e.createdAt)} · {humanize(e.actorType)}
                        {e.reason && ` · ${e.reason}`}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <Card title="Collections">
              {r.allocations.length === 0 ? (
                <p className="text-[13px] text-fg-muted">No collections allocated.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-[13px]">
                  {r.allocations.map((a) => (
                    <li key={a.id}>
                      Receipt {a.receiptNo}: {formatINR(a.amountPaise)} · {humanize(a.method)} ·{' '}
                      {a.receivedOn}
                      {a.reversed && <Badge className="ml-1">Reversed</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Attachments">
              {r.attachments.length === 0 ? (
                <p className="text-[13px] text-fg-muted">None.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-[13px]">
                  {r.attachments.map((a) => (
                    <li key={a.id}>
                      {a.fileName}{' '}
                      <span className="text-xs text-fg-muted">({humanize(a.scanStatus)})</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-fg-muted">
                File contents are not available during support access.
              </p>
            </Card>
            <Card title="Follow-ups">
              {r.followUps.length === 0 ? (
                <p className="text-[13px] text-fg-muted">None.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-[13px]">
                  {r.followUps.map((f) => (
                    <li key={f.id}>
                      {f.title} · {f.dueDate} <StatusBadge status={f.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </QueryState>
  );
}
