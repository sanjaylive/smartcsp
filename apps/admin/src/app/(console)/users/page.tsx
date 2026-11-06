'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useConfirm } from '@/components/dialog';
import { Guard } from '@/components/guard';
import { useToast } from '@/components/toast';
import {
  Badge,
  Button,
  Callout,
  Card,
  Empty,
  Input,
  PageHeader,
  Pagination,
  QueryState,
  StatusBadge,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { get, post } from '@/lib/api';
import { dt, humanize } from '@/lib/format';
import { useMe } from '@/lib/session';
import type { Page, UserRow } from '@/lib/types';

export default function UsersPage() {
  return (
    <Guard perm="users.manage" what="user management">
      <UsersInner />
    </Guard>
  );
}

function UsersInner() {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, dialog] = useConfirm();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(text.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [text]);
  const q = useQuery({
    queryKey: ['users', term, page],
    queryFn: () => get<Page<UserRow>>('/v1/admin/users', { q: term, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

  const setStatus = (u: UserRow, status: 'ACTIVE' | 'DISABLED') =>
    confirm({
      title: status === 'DISABLED' ? `Disable ${u.email}?` : `Enable ${u.email}?`,
      description:
        status === 'DISABLED'
          ? 'The user is signed out everywhere (web, mobile and admin) and cannot sign in until re-enabled. Their shop data is untouched.'
          : 'The user can sign in again.',
      body:
        status === 'DISABLED' && u.platformRole ? (
          <Callout tone="warning" title="This user is a platform admin">
            Disabling also removes their admin console access.
          </Callout>
        ) : undefined,
      confirmLabel: status === 'DISABLED' ? 'Disable user' : 'Enable user',
      tone: status === 'DISABLED' ? 'danger' : 'primary',
      reasonMin: 3,
      onConfirm: async (reason) => {
        await post(`/v1/admin/users/${u.id}/status`, { status, reason });
        toast.success(status === 'DISABLED' ? 'User disabled and signed out.' : 'User enabled.');
        void qc.invalidateQueries({ queryKey: ['users'] });
      },
    });

  return (
    <>
      <PageHeader
        title="Users"
        description="All people with a CSP2All account, across shops. Disabling a user revokes every session immediately."
      />
      <Card bodyClassName="p-0">
        <div className="border-b border-line p-3" role="search">
          <div className="relative max-w-md">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-fg-muted"
              aria-hidden
            />
            <Input
              aria-label="Search users by email"
              type="search"
              placeholder="Search by email"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <QueryState query={q}>
          {(d) =>
            d.items.length === 0 ? (
              <Empty title="No users match" />
            ) : (
              <>
                <Table label="Users">
                  <thead>
                    <tr>
                      <Th>User</Th>
                      <Th>Shops</Th>
                      <Th>Status</Th>
                      <Th>Last sign-in</Th>
                      <Th>Joined</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((u) => (
                      <tr key={u.id} data-testid="user-row">
                        <Td>
                          <div className="font-medium">{u.email}</div>
                          <div className="text-xs text-fg-muted">
                            {u.displayName ?? ''}
                            {u.platformRole && (
                              <Badge tone="brand" className="ml-1">
                                {humanize(u.platformRole)}
                              </Badge>
                            )}
                          </div>
                        </Td>
                        <Td>
                          {u.memberships.length === 0 ? (
                            <span className="text-fg-muted">—</span>
                          ) : (
                            <ul className="flex flex-col gap-0.5">
                              {u.memberships.map((m) => (
                                <li key={m.tenantId}>
                                  <Link
                                    href={`/tenants/${m.tenantId}`}
                                    className="text-brand hover:underline"
                                  >
                                    {m.tenantName}
                                  </Link>{' '}
                                  <span className="text-xs text-fg-muted">
                                    {humanize(m.role)}
                                    {m.status !== 'ACTIVE' && ` · ${humanize(m.status)}`}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </Td>
                        <Td>
                          <StatusBadge status={u.status} />
                        </Td>
                        <Td className="whitespace-nowrap">{dt(u.lastLoginAt)}</Td>
                        <Td className="whitespace-nowrap">{dt(u.createdAt)}</Td>
                        <Td className="text-right">
                          {u.id === me.userId ? (
                            <span className="text-xs text-fg-muted">You</span>
                          ) : u.status === 'ACTIVE' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger"
                              onClick={() => setStatus(u, 'DISABLED')}
                            >
                              Disable
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => setStatus(u, 'ACTIVE')}>
                              Enable
                            </Button>
                          )}
                        </Td>
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
      {dialog}
    </>
  );
}
