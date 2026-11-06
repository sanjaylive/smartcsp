'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Minus, Pencil, UserPlus, Users } from 'lucide-react';
import { formatDateTime, staffInviteSchema } from '@csp2all/shared';
import { api, isApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { qk, useFormErrors, usePermissions, zodToFieldErrors } from '@/lib/hooks';
import type { StaffMember } from '@/lib/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  tableCls,
} from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { QueryState, UpgradeNotice } from '@/components/query-state';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

interface Roles {
  permissions: string[];
  roles: { role: string; permissions: string[] }[];
  grantable: string[];
}

const EDITABLE_ROLES = ['MANAGER', 'OPERATOR', 'ACCOUNTANT'] as const;

function StaffInner() {
  const { t, tk } = useI18n();
  const { can, ctx } = usePermissions();
  const sp = useSearchParams();
  const [invite, setInvite] = useState(false);
  const [edit, setEdit] = useState<StaffMember | null>(null);
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<Roles>('/v1/roles') });
  const staff = useQuery({
    queryKey: ['staff'],
    queryFn: () => api<{ items: StaffMember[] }>('/v1/staff'),
  });
  useEffect(() => {
    if (sp.get('invite') && can('staff.manage')) setInvite(true);
  }, [sp, can]);
  const limit = ctx?.plan.entitlements.staffLimit ?? null;

  return (
    <>
      <PageHeader
        title={t('nav.staff')}
        description={t('staff.help')}
        actions={
          can('staff.manage') ? (
            <Button
              icon={<UserPlus aria-hidden className="size-4" />}
              onClick={() => setInvite(true)}
            >
              {t('staff.invite')}
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader
            title={t('staff.members')}
            description={
              limit !== null ? t('staff.limit', { used: ctx?.usage.staff ?? 0, limit }) : undefined
            }
          />
          <QueryState query={staff}>
            {(d) =>
              d.items.length === 0 ? (
                <EmptyState
                  icon={<Users aria-hidden className="size-6" />}
                  title={t('staff.none')}
                />
              ) : (
                <div className={tableCls.wrap}>
                  <table className={tableCls.table} data-testid="staff-table">
                    <thead>
                      <tr>
                        <th className={tableCls.th}>{t('staff.person')}</th>
                        <th className={tableCls.th}>{t('staff.role')}</th>
                        <th className={tableCls.th}>{t('common.status')}</th>
                        <th className={tableCls.th}>{t('staff.overrides')}</th>
                        <th className={tableCls.th}>{t('staff.lastLogin')}</th>
                        <th className={tableCls.th}>
                          <span className="sr-only">{t('common.actions')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.items.map((m) => (
                        <tr key={m.id}>
                          <td className={tableCls.td}>
                            <p className="font-semibold">
                              {m.displayName ?? m.email}{' '}
                              {m.isSelf ? <Badge tone="brand">{t('staff.you')}</Badge> : null}
                            </p>
                            <p className="text-[13px] text-fg-muted">{m.email}</p>
                          </td>
                          <td className={tableCls.td}>{tk(`role.${m.role}`)}</td>
                          <td className={tableCls.td}>
                            <Badge
                              tone={
                                m.status === 'ACTIVE'
                                  ? 'success'
                                  : m.status === 'INVITED'
                                    ? 'info'
                                    : 'neutral'
                              }
                            >
                              {tk(`memberStatus.${m.status}`)}
                            </Badge>
                          </td>
                          <td className={cn(tableCls.td, 'text-sm')}>
                            {m.grants.length ? (
                              <span className="block text-success">
                                +{m.grants.length} {t('staff.granted')}
                              </span>
                            ) : null}
                            {m.revokes.length ? (
                              <span className="block text-danger">
                                −{m.revokes.length} {t('staff.revoked')}
                              </span>
                            ) : null}
                            {!m.grants.length && !m.revokes.length ? (
                              <span className="text-fg-muted">{t('staff.roleDefaults')}</span>
                            ) : null}
                          </td>
                          <td className={cn(tableCls.td, 'text-sm whitespace-nowrap')}>
                            {m.lastLoginAt
                              ? formatDateTime(m.lastLoginAt, ctx?.tenant.timezone)
                              : '—'}
                          </td>
                          <td className={tableCls.td}>
                            {can('staff.manage') && !m.isSelf && m.role !== 'OWNER' ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Pencil aria-hidden className="size-4" />}
                                onClick={() => setEdit(m)}
                              >
                                {t('common.edit')}
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </QueryState>
        </Card>
        <Card>
          <CardHeader title={t('staff.matrix')} description={t('staff.matrixHelp')} />
          <QueryState query={roles}>
            {(r) => (
              <div className="max-h-[70vh] overflow-auto">
                <table
                  className={cn(tableCls.table, 'min-w-[560px]')}
                  data-testid="permission-matrix"
                >
                  <caption className="sr-only">{t('staff.matrix')}</caption>
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className={tableCls.th}>{t('staff.permission')}</th>
                      {r.roles.map((x) => (
                        <th key={x.role} className={cn(tableCls.th, 'text-center')}>
                          {tk(`role.${x.role}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.permissions.map((p) => (
                      <tr key={p}>
                        <td className={cn(tableCls.td, 'py-2')}>
                          <span className="block text-sm font-medium">{tk(`perm.${p}`)}</span>
                          <span className="block font-mono text-xs text-fg-muted">{p}</span>
                        </td>
                        {r.roles.map((x) => {
                          const has = x.permissions.includes(p);
                          return (
                            <td key={x.role} className={cn(tableCls.td, 'py-2 text-center')}>
                              {has ? (
                                <Check
                                  aria-label={t('staff.allowed')}
                                  className="mx-auto size-4 text-success"
                                />
                              ) : (
                                <Minus
                                  aria-label={t('staff.notAllowed')}
                                  className="mx-auto size-4 text-fg-muted"
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </QueryState>
        </Card>
      </div>
      {invite && roles.data ? (
        <StaffDialog roles={roles.data} onClose={() => setInvite(false)} />
      ) : null}
      {edit && roles.data ? (
        <StaffDialog roles={roles.data} member={edit} onClose={() => setEdit(null)} />
      ) : null}
    </>
  );
}

function StaffDialog({
  roles,
  member,
  onClose,
}: {
  roles: Roles;
  member?: StaffMember;
  onClose: () => void;
}) {
  const { t, tk } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const errs = useFormErrors();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<(typeof EDITABLE_ROLES)[number]>(
    (member?.role as (typeof EDITABLE_ROLES)[number]) ?? 'OPERATOR',
  );
  const [grants, setGrants] = useState<string[]>(member?.grants ?? []);
  const [revokes, setRevokes] = useState<string[]>(member?.revokes ?? []);
  const defaults = new Set(roles.roles.find((r) => r.role === role)?.permissions ?? []);
  const effective = (p: string) => (defaults.has(p) && !revokes.includes(p)) || grants.includes(p);
  const toggle = (p: string, on: boolean) => {
    if (defaults.has(p))
      setRevokes((r) => (on ? r.filter((x) => x !== p) : [...new Set([...r, p])]));
    else setGrants((g) => (on ? [...new Set([...g, p])] : g.filter((x) => x !== p)));
  };
  useEffect(() => {
    // Keep overrides meaningful when the role changes.
    setGrants((g) => g.filter((p) => !defaults.has(p)));
    setRevokes((r) => r.filter((p) => defaults.has(p)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const m = useMutation({
    mutationFn: (body: unknown) =>
      member
        ? api(`/v1/staff/${member.id}`, { method: 'PATCH', body })
        : api('/v1/staff/invite', { method: 'POST', body }),
    onSuccess: () => {
      toast('success', member ? t('common.saved') : t('staff.invited'));
      void qc.invalidateQueries({ queryKey: ['staff'] });
      void qc.invalidateQueries({ queryKey: qk.context });
      onClose();
    },
    onError: errs.fromError,
  });
  const statusM = useMutation({
    mutationFn: (status: 'ACTIVE' | 'DISABLED') =>
      api(`/v1/staff/${member!.id}`, {
        method: 'PATCH',
        body: { version: member!.version, status },
      }),
    onSuccess: () => {
      toast('success', t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['staff'] });
      void qc.invalidateQueries({ queryKey: qk.context });
      onClose();
    },
    onError: errs.fromError,
  });
  const submit = () => {
    errs.clear();
    const g = grants.filter((p) => roles.grantable.includes(p));
    if (member) {
      m.mutate({ version: member.version, role, grants: g, revokes });
      return;
    }
    const body = { email, displayName, role, grants: g, revokes };
    const r = staffInviteSchema.safeParse(body);
    if (!r.success) return errs.setFields(zodToFieldErrors(r.error));
    m.mutate(body);
  };
  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={
        member
          ? t('staff.editTitle', { name: member.displayName ?? member.email })
          : t('staff.invite')
      }
      description={member ? undefined : t('staff.inviteHelp')}
      footer={
        <>
          {member ? (
            member.status === 'DISABLED' ? (
              <Button
                variant="outline"
                loading={statusM.isPending}
                onClick={() => statusM.mutate('ACTIVE')}
                className="mr-auto"
              >
                {t('staff.enable')}
              </Button>
            ) : (
              <Button
                variant="danger"
                loading={statusM.isPending}
                onClick={() => statusM.mutate('DISABLED')}
                className="mr-auto"
              >
                {t('staff.disable')}
              </Button>
            )
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={m.isPending}>
            {member ? t('common.save') : t('staff.sendInvite')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!member ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('auth.email.label')} required error={errs.get('email')}>
              {(p) => (
                <Input
                  id={p.id}
                  type="email"
                  aria-invalid={p.invalid || undefined}
                  aria-describedby={p.describedBy}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            <Field label={t('staff.name')} required error={errs.get('displayName')}>
              {(p) => (
                <Input
                  id={p.id}
                  aria-invalid={p.invalid || undefined}
                  aria-describedby={p.describedBy}
                  value={displayName}
                  maxLength={80}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              )}
            </Field>
          </div>
        ) : null}
        <Field label={t('staff.role')} error={errs.get('role')}>
          {(p) => (
            <Select id={p.id} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              {EDITABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {tk(`role.${r}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">{t('staff.permissions')}</legend>
          <p className="mb-3 text-[13px] text-fg-muted">{t('staff.permissionsHelp')}</p>
          <div className="grid max-h-80 gap-2 overflow-y-auto rounded-xl border border-border p-3 sm:grid-cols-2">
            {roles.permissions.map((p) => {
              const canToggle = defaults.has(p) || roles.grantable.includes(p);
              return (
                <Checkbox
                  key={p}
                  checked={effective(p)}
                  disabled={!canToggle}
                  onChange={(v) => toggle(p, v)}
                  label={<span className="text-sm">{tk(`perm.${p}`)}</span>}
                  description={
                    grants.includes(p)
                      ? t('staff.extraGrant')
                      : revokes.includes(p)
                        ? t('staff.removed')
                        : !canToggle
                          ? t('staff.ownerOnly')
                          : undefined
                  }
                />
              );
            })}
          </div>
        </fieldset>
        {errs.formError && isApiError(errs.formError, 'QUOTA_EXCEEDED') ? (
          <UpgradeNotice error={errs.formError} />
        ) : null}
        {errs.formMessage &&
        !isApiError(errs.formError, 'QUOTA_EXCEEDED') &&
        !Object.keys(errs.fields).length ? (
          <Alert tone="danger">{errs.formMessage}</Alert>
        ) : null}
      </div>
    </Dialog>
  );
}

export default function StaffPage() {
  return (
    <Suspense>
      <StaffInner />
    </Suspense>
  );
}
