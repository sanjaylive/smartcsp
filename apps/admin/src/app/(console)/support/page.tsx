'use client';

import { Eye } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Guard } from '@/components/guard';
import {
  fmtCountdown,
  isActiveSession,
  useCountdown,
  useEndSupportSession,
  useSupportSessions,
} from '@/components/shell';
import { StartSupportDialog } from '@/components/support-dialog';
import { Badge, Button, Card, Empty, PageHeader, QueryState, Table, Td, Th } from '@/components/ui';
import { dt, shortId } from '@/lib/format';
import type { SupportSession } from '@/lib/types';

export default function SupportPage() {
  return (
    <Guard perm="support.access" what="support sessions">
      <SupportInner />
    </Guard>
  );
}

function SupportInner() {
  const q = useSupportSessions();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="Support sessions"
        description="Time-limited, read-only access to one shop’s records. The shop is notified and every read is audited. Start a session from a tenant’s page, or here with a tenant ID."
        actions={
          <Button
            variant="primary"
            icon={<Eye className="size-4" aria-hidden />}
            onClick={() => setOpen(true)}
          >
            Start session
          </Button>
        }
      />
      <Card title="Your sessions" bodyClassName="p-0">
        <QueryState query={q}>
          {(d) =>
            d.items.length === 0 ? (
              <Empty title="No support sessions yet">
                Open one when a shop asks for help and you need to see their records.
              </Empty>
            ) : (
              <Table label="Support sessions">
                <thead>
                  <tr>
                    <Th>Session</Th>
                    <Th>Tenant</Th>
                    <Th>Reason</Th>
                    <Th>Started</Th>
                    <Th>Status</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((s) => (
                    <SessionRow key={s.id} s={s} />
                  ))}
                </tbody>
              </Table>
            )
          }
        </QueryState>
      </Card>
      {open && <StartSupportDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function SessionRow({ s }: { s: SupportSession }) {
  const active = isActiveSession(s);
  const left = useCountdown(s.expiresAt);
  const end = useEndSupportSession();
  return (
    <tr>
      <Td className="font-mono text-[12px]">{shortId(s.id)}</Td>
      <Td>
        <Link
          href={`/tenants/${s.tenantId}`}
          className="font-mono text-[12px] text-brand hover:underline"
        >
          {shortId(s.tenantId)}
        </Link>
      </Td>
      <Td className="max-w-[320px]">{s.reason}</Td>
      <Td className="whitespace-nowrap">{dt(s.startedAt)}</Td>
      <Td>
        {active && left > 0 ? (
          <Badge tone="warning">Active · {fmtCountdown(left)}</Badge>
        ) : (
          <Badge>{s.endedAt ? `Ended ${dt(s.endedAt)}` : `Expired ${dt(s.expiresAt)}`}</Badge>
        )}
      </Td>
      <Td className="whitespace-nowrap text-right">
        {active && left > 0 && (
          <div className="flex justify-end gap-2">
            <Link
              href={`/support/${s.id}`}
              className="inline-flex h-8 items-center rounded-md border border-line px-2.5 text-[13px] font-medium hover:bg-muted"
            >
              Open
            </Link>
            <Button
              size="sm"
              variant="ghost"
              loading={end.isPending}
              onClick={() => end.mutate(s.id)}
            >
              End
            </Button>
          </div>
        )}
      </Td>
    </tr>
  );
}
