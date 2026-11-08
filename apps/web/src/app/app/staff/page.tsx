'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Minus, Pencil, ShieldCheck, UserPlus, Users } from 'lucide-react';
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
import { Drawer } from '@/components/ui/dialog';
import { QueryState, UpgradeNotice } from '@/components/query-state';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

interface Roles {
  permissions: string[];
  roles: { role: string; permissions: string[] }[];
  grantable: string[];
}

const EDITABLE_ROLES = ['MANAGER', 'OPERATOR', 'ACCOUNTANT'] as const;

/** Permissions grouped by area so a role's access reads like a checklist, not a grid. */
const PERM_GROUPS: { title: string; match: (p: string) => boolean }[] = [
  { title: 'Records', match: (p) => p.startsWith('records.') || p === 'attachments.upload' },
  {
    title: 'Customers & follow-ups',
    match: (p) => p.startsWith('customers.') || p.startsWith('followups.'),
  },
  {
    title: 'Money',
    match: (p) =>
      ['dues.', 'cashbook.', 'expenses.', 'commissions.', 'day.'].some((x) => p.startsWith(x)),
  },
  { title: 'Reports', match: (p) => p.startsWith('reports.') || p.startsWith('exports.') },
  { title: 'Shop & settings', match: () => true },
];
function groupPerms(perms: string[]) {
  const left = new Set(perms);
  return PERM_GROUPS.map((g) => {
    const items = [...left].filter(g.match);
    items.forEach((p) => left.delete(p));
    return { title: g.title, items };
  }).filter((g) => g.items.length);
}

const ROLE_HELP: Record<string, string> = {
  OWNER: 'Full access to everything, including billing and staff.',
  MANAGER: 'Runs the counter day to day: records, money, staff and reports.',
  OPERATOR: 'Serves customers and records services; limited money access.',
  ACCOUNTANT: 'Reads the books and reports; cannot change records.',
};

function StaffInner() {
  const { t, tk } = useI18n();
  const { can, ctx } = usePermissions();
  const sp = useSearchParams();
  const [tab, setTab] = useState<'members' | 'roles'>(
    sp.get('tab') === 'roles' ? 'roles' : 'members',
  );
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
  const count = staff.data?.items.length ?? 0;

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

      <div
        role="tablist"
        aria-label={t('nav.staff')}
        className="mb-4 inline-flex gap-1 rounded-xl border border-border bg-surface p-1"
      >
        {(
          [
            ['members', Users, `${t('staff.members')}`, count],
            ['roles', ShieldCheck, 'Role permissions', roles.data?.roles.length ?? 0],
          ] as const
        ).map(([key, Icon, text, n]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'flex min-h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition',
              tab === key
                ? 'bg-brand-bg text-brand'
                : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
            )}
          >
            <Icon aria-hidden className="size-4" />
            {text}
            <span className="money rounded-full bg-surface-muted px-1.5 text-xs text-fg-muted">
              {n}
            </span>
          </button>
        ))}
      </div>

      {tab === 'members' ? (
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
                <ul className="divide-y divide-border" data-testid="staff-table">
                  {d.items.map((m) => {
                    const name = m.displayName ?? m.email ?? '';
                    return (
                      <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-bg font-display text-sm font-bold text-brand">
                          {name.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                            <span className="truncate">{name}</span>
                            {m.isSelf ? <Badge tone="brand">{t('staff.you')}</Badge> : null}
                          </p>
                          <p className="truncate text-xs text-fg-muted">
                            {m.email}
                            {m.lastLoginAt
                              ? ` · ${t('staff.lastLogin')} ${formatDateTime(m.lastLoginAt, ctx?.tenant.timezone)}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="neutral">{tk(`role.${m.role}`)}</Badge>
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
                          {m.grants.length ? (
                            <Badge tone="success">
                              +{m.grants.length} {t('staff.granted')}
                            </Badge>
                          ) : null}
                          {m.revokes.length ? (
                            <Badge tone="danger">
                              −{m.revokes.length} {t('staff.revoked')}
                            </Badge>
                          ) : null}
                        </div>
                        {can('staff.manage') && !m.isSelf && m.role !== 'OWNER' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<Pencil aria-hidden className="size-4" />}
                            onClick={() => setEdit(m)}
                          >
                            {t('common.edit')}
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )
            }
          </QueryState>
        </Card>
      ) : (
        <QueryState query={roles}>{(r) => <RolePermissions roles={r} />}</QueryState>
      )}

      {invite && roles.data ? (
        <StaffDialog roles={roles.data} onClose={() => setInvite(false)} />
      ) : null}
      {edit && roles.data ? (
        <StaffDialog roles={roles.data} member={edit} onClose={() => setEdit(null)} />
      ) : null}
    </>
  );
}

function RolePermissions({ roles: r }: { roles: Roles }) {
  const { t, tk } = useI18n();
  const [role, setRole] = useState(
    r.roles.find((x) => x.role === 'OPERATOR')?.role ?? r.roles[0]?.role ?? '',
  );
  const [compare, setCompare] = useState(false);
  const current = r.roles.find((x) => x.role === role);
  const allowed = new Set(current?.permissions ?? []);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        role="radiogroup"
        aria-label={t('staff.role')}
      >
        {r.roles.map((x) => {
          const on = x.role === role && !compare;
          return (
            <button
              key={x.role}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setRole(x.role);
                setCompare(false);
              }}
              className={cn(
                'rounded-xl border bg-surface p-3.5 text-left transition',
                on ? 'border-brand ring-1 ring-brand' : 'border-border hover:border-brand/40',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-display font-bold">{tk(`role.${x.role}`)}</span>
                <span className="money text-xs font-semibold text-fg-muted">
                  {x.permissions.length}/{r.permissions.length}
                </span>
              </span>
              <span className="mt-1 block text-xs text-fg-muted">{ROLE_HELP[x.role] ?? ''}</span>
              <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <span
                  className="block h-full rounded-full bg-brand"
                  style={{ width: `${(x.permissions.length / r.permissions.length) * 100}%` }}
                />
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">{t('staff.matrixHelp')}</p>
        <Button size="sm" variant="ghost" onClick={() => setCompare((c) => !c)}>
          {compare ? 'Show one role' : 'Compare all roles'}
        </Button>
      </div>

      {compare ? (
        <Card>
          <div className="max-h-[70vh] overflow-auto">
            <table className={cn(tableCls.table, 'min-w-[560px]')} data-testid="permission-matrix">
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
                {groupPerms(r.permissions).flatMap((g) => [
                  <tr key={`g-${g.title}`}>
                    <th
                      colSpan={r.roles.length + 1}
                      className="bg-surface-muted/40 px-3 py-1.5 text-left text-xs font-bold tracking-wide text-fg-muted uppercase"
                    >
                      {g.title}
                    </th>
                  </tr>,
                  ...g.items.map((p) => (
                    <tr key={p}>
                      <td className={cn(tableCls.td, 'py-2 text-sm font-medium')}>
                        {tk(`perm.${p}`)}
                      </td>
                      {r.roles.map((x) => (
                        <td key={x.role} className={cn(tableCls.td, 'py-2 text-center')}>
                          {x.permissions.includes(p) ? (
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
                      ))}
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groupPerms(r.permissions).map((g) => {
            const n = g.items.filter((p) => allowed.has(p)).length;
            return (
              <Card key={g.title}>
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <h3 className="text-sm font-bold">{g.title}</h3>
                  <span className="money text-xs font-semibold text-fg-muted">
                    {n}/{g.items.length}
                  </span>
                </div>
                <ul className="flex flex-col p-1.5">
                  {g.items.map((p) => {
                    const has = allowed.has(p);
                    return (
                      <li
                        key={p}
                        className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm"
                      >
                        <span
                          className={cn(
                            'grid size-5 shrink-0 place-items-center rounded-full',
                            has ? 'bg-success-bg text-success' : 'bg-surface-muted text-fg-muted',
                          )}
                        >
                          {has ? (
                            <Check
                              aria-label={t('staff.allowed')}
                              className="size-3"
                              strokeWidth={3}
                            />
                          ) : (
                            <Minus aria-label={t('staff.notAllowed')} className="size-3" />
                          )}
                        </span>
                        <span className={cn(!has && 'text-fg-muted')}>{tk(`perm.${p}`)}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
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
    <Drawer
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
    </Drawer>
  );
}

export default function StaffPage() {
  return (
    <Suspense>
      <StaffInner />
    </Suspense>
  );
}
