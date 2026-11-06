'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useState } from 'react';
import { Guard } from '@/components/guard';
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  PageHeader,
  Pagination,
  QueryState,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { get } from '@/lib/api';
import { dt, shortId } from '@/lib/format';
import type { AuditEvent, Page } from '@/lib/types';

const ACTION_PRESETS = [
  'admin.',
  'support.',
  'auth.',
  'admin.tenant_',
  'admin.plan_',
  'admin.payment_',
  'admin.entitlement_override',
];

export default function AuditPage() {
  return (
    <Guard perm="audit.view" what="the audit log">
      <AuditInner />
    </Guard>
  );
}

function AuditInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantId = params.get('tenantId') ?? '';
  const action = params.get('action') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;
  const [t, setT] = useState(tenantId);
  const [a, setA] = useState(action);
  const [open, setOpen] = useState<string | null>(null);
  const uuidOk =
    !t.trim() || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.trim());
  const set = (next: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    router.replace(`/audit${sp.size ? `?${sp}` : ''}`);
  };
  const q = useQuery({
    queryKey: ['audit', tenantId, action, page],
    queryFn: () =>
      get<Page<AuditEvent>>('/v1/admin/audit', { tenantId, action, page, pageSize: 50 }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every admin, support and security-relevant action across the platform. Entries are append-only."
      />
      <Card bodyClassName="p-0">
        <form
          className="flex flex-wrap items-end gap-3 border-b border-line p-3"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (uuidOk) set({ tenantId: t.trim(), action: a.trim(), page: '' });
          }}
        >
          <Field
            label="Tenant ID"
            className="min-w-[280px]"
            error={uuidOk ? undefined : 'Enter a full tenant UUID'}
          >
            {(p) => (
              <Input
                {...p}
                value={t}
                onChange={(e) => setT(e.target.value)}
                placeholder="All tenants"
                className="font-mono"
              />
            )}
          </Field>
          <Field label="Action starts with" className="min-w-[200px]">
            {(p) => (
              <>
                <Input
                  {...p}
                  value={a}
                  onChange={(e) => setA(e.target.value)}
                  placeholder="e.g. admin.tenant_"
                  list="audit-actions"
                />
                <datalist id="audit-actions">
                  {ACTION_PRESETS.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Button type="submit" variant="primary">
            Apply filters
          </Button>
          {(tenantId || action) && (
            <Button
              variant="ghost"
              onClick={() => {
                setT('');
                setA('');
                set({ tenantId: '', action: '', page: '' });
              }}
            >
              Clear
            </Button>
          )}
        </form>
        <QueryState query={q}>
          {(d) =>
            d.items.length === 0 ? (
              <Empty title="No audit events match these filters" />
            ) : (
              <>
                <Table label="Audit events">
                  <thead>
                    <tr>
                      <Th />
                      <Th>When</Th>
                      <Th>Action</Th>
                      <Th>Actor</Th>
                      <Th>Tenant</Th>
                      <Th>Target</Th>
                      <Th>Request</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((e) => (
                      <Fragment key={e.id}>
                        <tr className="hover:bg-muted/50">
                          <Td>
                            <button
                              type="button"
                              className="rounded p-0.5 hover:bg-muted"
                              aria-expanded={open === e.id}
                              aria-label={`Details for ${e.action}`}
                              onClick={() => setOpen(open === e.id ? null : e.id)}
                            >
                              {open === e.id ? (
                                <ChevronDown className="size-4" aria-hidden />
                              ) : (
                                <ChevronRight className="size-4" aria-hidden />
                              )}
                            </button>
                          </Td>
                          <Td className="whitespace-nowrap">{dt(e.createdAt)}</Td>
                          <Td className="font-mono text-[12px]">{e.action}</Td>
                          <Td>
                            <Badge
                              tone={
                                e.actorType === 'SUPPORT'
                                  ? 'warning'
                                  : e.actorType === 'ADMIN'
                                    ? 'brand'
                                    : 'neutral'
                              }
                            >
                              {e.actorType}
                            </Badge>
                            <div className="font-mono text-[11px] text-fg-muted">
                              {shortId(e.actorUserId)}
                            </div>
                          </Td>
                          <Td>
                            {e.tenantId ? (
                              <Link
                                href={`/tenants/${e.tenantId}`}
                                className="font-mono text-[12px] text-brand hover:underline"
                              >
                                {shortId(e.tenantId)}
                              </Link>
                            ) : (
                              <span className="text-fg-muted">Platform</span>
                            )}
                          </Td>
                          <Td className="text-xs">
                            {e.targetType ?? '—'}{' '}
                            <span className="font-mono text-fg-muted">
                              {e.targetId ? shortId(e.targetId) : ''}
                            </span>
                          </Td>
                          <Td className="font-mono text-[11px] text-fg-muted">
                            {e.requestId ? e.requestId.slice(0, 12) : '—'}
                          </Td>
                        </tr>
                        {open === e.id && (
                          <tr>
                            <Td colSpan={7} className="bg-muted/40">
                              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px]">
                                {JSON.stringify({ ...e, data: e.data }, null, 2)}
                              </pre>
                            </Td>
                          </tr>
                        )}
                      </Fragment>
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
