'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { PLATFORM_ROLE_PERMISSIONS, type PlatformRole } from '@csp2all/shared';
import { Modal, useConfirm } from '@/components/dialog';
import { Guard } from '@/components/guard';
import { useToast } from '@/components/toast';
import {
  Badge,
  Button,
  Callout,
  Card,
  Empty,
  Field,
  FormError,
  Input,
  PageHeader,
  QueryState,
  Select,
  StatusBadge,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { get, isApiError, patch, post } from '@/lib/api';
import { dt, humanize } from '@/lib/format';
import { useMe } from '@/lib/session';
import type { AdminRow } from '@/lib/types';

const ROLE_INFO: Record<PlatformRole, string> = {
  SUPER_ADMIN: 'Full platform control: tenants, plans, payments, catalog, settings and admins.',
  SUPPORT:
    'View the platform, open read-only support sessions and read the audit log. Cannot change anything else.',
};

export default function AdminsPage() {
  return (
    <Guard perm="admins.manage" what="admin management">
      <AdminsInner />
    </Guard>
  );
}

function AdminsInner() {
  const me = useMe();
  const q = useQuery({
    queryKey: ['admins'],
    queryFn: () => get<{ items: AdminRow[] }>('/v1/admin/admins'),
  });
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, dialog] = useConfirm();
  const [adding, setAdding] = useState(false);

  const update = (
    a: AdminRow,
    body: { role?: PlatformRole; status?: 'ACTIVE' | 'DISABLED' },
    title: string,
    description: string,
    confirmLabel: string,
    danger: boolean,
  ) =>
    confirm({
      title,
      description,
      body:
        a.userId === me.userId ? (
          <Callout tone="warning" title="This is your own account">
            You will be signed out of the admin console immediately.
          </Callout>
        ) : undefined,
      confirmLabel,
      tone: danger ? 'danger' : 'primary',
      onConfirm: async () => {
        await patch(`/v1/admin/admins/${a.id}`, body);
        toast.success('Admin updated. Their admin sessions were signed out.');
        void qc.invalidateQueries({ queryKey: ['admins'] });
      },
    });

  return (
    <>
      <PageHeader
        title="Platform admins"
        description="People who can sign in to this console. Every admin must enrol an authenticator app on first sign-in. At least one active super admin must always remain."
        actions={
          <Button
            variant="primary"
            icon={<UserPlus className="size-4" aria-hidden />}
            onClick={() => setAdding(true)}
          >
            Add admin
          </Button>
        }
      />
      <div className="mb-3 grid gap-2 md:grid-cols-2">
        {(Object.keys(ROLE_INFO) as PlatformRole[]).map((r) => (
          <div key={r} className="rounded-md border border-line bg-surface px-3 py-2 text-[13px]">
            <strong>{humanize(r)}</strong> — {ROLE_INFO[r]}
            <div className="mt-1 text-xs text-fg-muted">
              {PLATFORM_ROLE_PERMISSIONS[r].join(', ')}
            </div>
          </div>
        ))}
      </div>
      <Card bodyClassName="p-0">
        <QueryState query={q}>
          {(d) =>
            d.items.length === 0 ? (
              <Empty title="No admins" />
            ) : (
              <Table label="Platform admins">
                <thead>
                  <tr>
                    <Th>Admin</Th>
                    <Th>Role</Th>
                    <Th>Status</Th>
                    <Th>Two-factor</Th>
                    <Th>Last sign-in</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((a) => (
                    <tr key={a.id} data-testid="admin-row">
                      <Td>
                        <div className="font-medium">{a.email}</div>
                        {a.userId === me.userId && <Badge tone="brand">You</Badge>}
                      </Td>
                      <Td>
                        <Select
                          aria-label={`Role for ${a.email}`}
                          className="h-8 w-auto"
                          value={a.role}
                          onChange={(e) => {
                            const role = e.target.value as PlatformRole;
                            update(
                              a,
                              { role },
                              `Change ${a.email} to ${humanize(role)}?`,
                              `${ROLE_INFO[role]} Their current admin sessions end and they sign in again with the new role.`,
                              'Change role',
                              role === 'SUPPORT',
                            );
                          }}
                        >
                          <option value="SUPER_ADMIN">Super admin</option>
                          <option value="SUPPORT">Support</option>
                        </Select>
                      </Td>
                      <Td>
                        <StatusBadge status={a.status} />
                      </Td>
                      <Td>
                        {a.mfaEnabled ? (
                          <Badge tone="success">Enrolled</Badge>
                        ) : (
                          <Badge tone="warning">Pending first sign-in</Badge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">{dt(a.lastLoginAt)}</Td>
                      <Td>
                        {a.status === 'ACTIVE' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            onClick={() =>
                              update(
                                a,
                                { status: 'DISABLED' },
                                `Disable ${a.email}?`,
                                'They are signed out of the admin console and cannot sign in until re-enabled. Their user account is not otherwise affected.',
                                'Disable admin',
                                true,
                              )
                            }
                          >
                            Disable
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() =>
                              update(
                                a,
                                { status: 'ACTIVE' },
                                `Re-enable ${a.email}?`,
                                'They can sign in to the admin console again.',
                                'Enable admin',
                                false,
                              )
                            }
                          >
                            Enable
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )
          }
        </QueryState>
      </Card>
      {dialog}
      {adding && <AddAdminDialog onClose={() => setAdding(false)} />}
    </>
  );
}

function AddAdminDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PlatformRole>('SUPPORT');
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => post('/v1/admin/admins', { email: email.trim(), role }),
    onSuccess: () => {
      toast.success(`${email.trim()} added. They enrol two-factor on first sign-in.`);
      void qc.invalidateQueries({ queryKey: ['admins'] });
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Add platform admin"
      description="They sign in at this console with an email code and must set up an authenticator app."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!email.includes('@')}
            onClick={() => m.mutate()}
          >
            Add admin
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field
          label="Email"
          required
          error={isApiError(m.error) ? m.error.field('email') : undefined}
        >
          {(p) => (
            <Input
              {...p}
              type="email"
              name="admin-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          )}
        </Field>
        <Field label="Role" required hint={ROLE_INFO[role]}>
          {(p) => (
            <Select
              {...p}
              name="admin-role"
              value={role}
              onChange={(e) => setRole(e.target.value as PlatformRole)}
            >
              <option value="SUPPORT">Support</option>
              <option value="SUPER_ADMIN">Super admin</option>
            </Select>
          )}
        </Field>
        {role === 'SUPER_ADMIN' && (
          <Callout tone="warning">
            Super admins can change plans, approve payments, suspend shops and manage other admins.
          </Callout>
        )}
        <FormError error={m.error} />
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
