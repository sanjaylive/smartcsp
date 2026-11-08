'use client';

/* Account drawer opened from the avatar: who you are, this shop, preferences and sign-out. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Building2,
  Check,
  ChevronRight,
  CreditCard,
  Laptop,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Pencil,
  Phone,
  Repeat,
  ShieldCheck,
  Store,
  Sun,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { profileUpdateSchema } from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { qk, zodToFieldErrors } from '@/lib/hooks';
import { useTheme, type ThemePref } from '@/lib/theme';
import type { Me, TenantContext } from '@/lib/types';
import { cn } from '@/lib/cn';
import { Badge, Button, Input } from './ui';
import { Drawer } from './ui/dialog';
import { useToast } from './ui/toast';

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0]![0] ?? '') + (parts.length > 1 ? (parts.at(-1)![0] ?? '') : '')).toUpperCase();
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-1 text-[11px] font-bold tracking-wider text-fg-muted uppercase">{title}</h3>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">{children}</div>
    </section>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-muted text-fg-muted">
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-fg-muted">{label}</p>
        {value !== undefined ? (
          <div className="truncate text-sm font-semibold">{value || '—'}</div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function LinkRow({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center gap-3 border-b border-border px-4 text-sm font-semibold transition last:border-b-0 hover:bg-surface-muted"
    >
      <Icon aria-hidden className="size-4 text-fg-muted" />
      <span className="flex-1">{label}</span>
      <ChevronRight aria-hidden className="size-4 text-fg-muted" />
    </Link>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="mt-1.5 flex gap-1 rounded-xl bg-surface-muted p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold transition',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
          )}
        >
          {o.icon ? <o.icon aria-hidden className="size-3.5" /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProfileDrawer({
  open,
  onOpenChange,
  me,
  ctx,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  me: Me;
  ctx: TenantContext;
}) {
  const { t, tk, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const identity = me.user.displayName ?? me.user.email ?? me.user.phone ?? '';
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.user.displayName ?? '');
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState<'one' | 'all' | null>(null);

  useEffect(() => {
    if (!open) {
      setEditing(false);
      setNameErr(null);
      setName(me.user.displayName ?? '');
    }
  }, [open, me.user.displayName]);

  const patch = async (body: { displayName?: string; locale?: 'en' | 'hi' }) => {
    const updated = await api<Me>('/v1/auth/me', { method: 'PATCH', body });
    qc.setQueryData(qk.me, (old: Me | undefined) => (old ? { ...old, user: updated.user } : old));
    void qc.invalidateQueries({ queryKey: qk.context });
  };

  const saveName = async () => {
    const r = profileUpdateSchema.safeParse({ displayName: name });
    if (!r.success) {
      setNameErr(Object.values(zodToFieldErrors(r.error))[0]?.[0] ?? 'Enter your name');
      return;
    }
    setSaving(true);
    try {
      await patch({ displayName: r.data.displayName });
      setEditing(false);
      setNameErr(null);
      toast('success', 'Name updated');
    } catch {
      setNameErr('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const changeLocale = (l: 'en' | 'hi') => {
    setLocale(l);
    void patch({ locale: l }).catch(() => undefined);
  };

  const signOut = async (all: boolean) => {
    setLeaving(all ? 'all' : 'one');
    try {
      await api(all ? '/v1/auth/logout-all' : '/v1/auth/logout', {
        method: 'POST',
        noAuthRedirect: true,
      });
    } finally {
      qc.clear();
      window.location.assign('/login');
    }
  };

  const nav = new Map(ctx.navigation.map((n) => [n.key, n.path]));
  const links = (
    [
      ['shop', Store, t('nav.shop')],
      ['staff', Users, t('nav.staff')],
      ['subscription', CreditCard, t('nav.subscription')],
      ['notifications', Bell, t('nav.notifications')],
      ['security', ShieldCheck, 'Security & devices'],
    ] as const
  ).filter(([k]) => nav.has(k));
  const place = [ctx.tenant.district, ctx.tenant.state].filter(Boolean).join(', ');

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="My account"
      description="Your profile, shop and preferences"
    >
      <div className="flex flex-col gap-5">
        {/* identity card */}
        <div className="relative overflow-hidden rounded-2xl bg-brand p-4 text-on-brand">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-10 -right-10 size-36 rounded-full bg-white/10"
          />
          <div className="relative flex items-center gap-3.5">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/20 text-xl font-black ring-2 ring-white/30">
              {initialsOf(identity)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg leading-tight font-bold">{identity || 'Your name'}</p>
              <p className="truncate text-[13px] opacity-85">{me.user.email ?? me.user.phone}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold">
                  {tk(`role.${ctx.membership.role}`)}
                </span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold">
                  {ctx.plan.name}
                </span>
              </div>
            </div>
          </div>
        </div>

        <Section title="Your details">
          <Row icon={Pencil} label="Name">
            {editing ? (
              <form
                className="mt-1 flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveName();
                }}
              >
                <Input
                  autoFocus
                  aria-label="Your name"
                  aria-invalid={!!nameErr || undefined}
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="min-h-9"
                />
                <Button type="submit" size="sm" loading={saving} aria-label="Save name">
                  <Check aria-hidden className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Cancel"
                  onClick={() => {
                    setEditing(false);
                    setNameErr(null);
                    setName(me.user.displayName ?? '');
                  }}
                >
                  <X aria-hidden className="size-4" />
                </Button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{me.user.displayName || '—'}</span>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="ml-auto rounded-md px-2 py-1 text-xs font-bold text-brand hover:bg-brand-bg"
                >
                  Edit
                </button>
              </div>
            )}
            {nameErr ? (
              <p role="alert" className="mt-1 text-xs text-danger">
                {nameErr}
              </p>
            ) : null}
          </Row>
          <Row icon={Mail} label="Email" value={me.user.email} />
          <Row icon={Phone} label="Mobile" value={me.user.phone ? `+91 ${me.user.phone}` : null} />
        </Section>

        <Section title="Shop">
          <Row icon={Building2} label="Current shop" value={ctx.tenant.name} />
          {place ? <Row icon={MapPin} label="Location" value={place} /> : null}
          {me.tenants.length > 1 ? (
            <LinkRow
              href="/select-shop"
              icon={Repeat}
              label={`Switch shop (${me.tenants.length})`}
            />
          ) : null}
        </Section>

        <Section title="Preferences">
          <Row icon={Laptop} label="Language">
            <Segmented
              label="Language"
              value={locale as 'en' | 'hi'}
              onChange={changeLocale}
              options={[
                { value: 'en', label: 'English' },
                { value: 'hi', label: 'हिंदी' },
              ]}
            />
          </Row>
          <Row icon={theme === 'dark' ? Moon : Sun} label="Appearance">
            <Segmented<ThemePref>
              label="Appearance"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: 'Light', icon: Sun },
                { value: 'dark', label: 'Dark', icon: Moon },
                { value: 'system', label: 'Auto', icon: Laptop },
              ]}
            />
          </Row>
        </Section>

        {links.length ? (
          <Section title="Quick links">
            {links.map(([k, icon, label]) => (
              <LinkRow key={k} href={nav.get(k)!} icon={icon} label={label} />
            ))}
          </Section>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="border-danger/40 text-danger hover:bg-danger-bg"
            loading={leaving === 'one'}
            disabled={!!leaving}
            icon={<LogOut aria-hidden className="size-4" />}
            onClick={() => void signOut(false)}
          >
            {t('common.logout')}
          </Button>
          <button
            type="button"
            disabled={!!leaving}
            onClick={() => void signOut(true)}
            className="text-center text-xs font-semibold text-fg-muted hover:text-danger disabled:opacity-50"
          >
            {leaving === 'all' ? 'Signing out everywhere…' : 'Sign out of all devices'}
          </button>
          <p className="text-center text-[11px] text-fg-muted">
            Signed in as <Badge tone="neutral">{me.user.email ?? me.user.phone}</Badge>
          </p>
        </div>
      </div>
    </Drawer>
  );
}
