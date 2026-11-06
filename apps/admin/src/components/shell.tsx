'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BadgeIndianRupee,
  Bell,
  Building2,
  Cable,
  ClipboardList,
  Cog,
  Eye,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  Menu,
  Package,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { PlatformPermission } from '@csp2all/shared';
import { AdminBrand } from './brand';
import { ThemeToggle } from './theme-toggle';
import { Button, Loading, cx } from './ui';
import { api, get, isApiError, post } from '@/lib/api';
import { MeProvider, useMe, useMeQuery } from '@/lib/session';
import type { SupportSession } from '@/lib/types';
import { useToast } from './toast';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  perm: PlatformPermission;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Platform',
    items: [
      { href: '/', label: 'Overview', icon: LayoutDashboard, perm: 'platform.view' },
      { href: '/tenants', label: 'Tenants', icon: Building2, perm: 'platform.view' },
      { href: '/users', label: 'Users', icon: Users, perm: 'users.manage' },
      { href: '/support', label: 'Support sessions', icon: Eye, perm: 'support.access' },
    ],
  },
  {
    section: 'Billing',
    items: [
      { href: '/plans', label: 'Plans', icon: Package, perm: 'platform.view' },
      { href: '/payments', label: 'Payments', icon: BadgeIndianRupee, perm: 'payments.approve' },
    ],
  },
  {
    section: 'Operations',
    items: [
      { href: '/services', label: 'Service catalog', icon: ListChecks, perm: 'platform.view' },
      { href: '/connectors', label: 'Connectors & health', icon: Cable, perm: 'connectors.manage' },
      { href: '/emails', label: 'Email delivery', icon: Mail, perm: 'platform.view' },
      { href: '/jobs', label: 'Background jobs', icon: Activity, perm: 'jobs.manage' },
      { href: '/announcements', label: 'Announcements', icon: Bell, perm: 'platform.view' },
    ],
  },
  {
    section: 'Governance',
    items: [
      { href: '/audit', label: 'Audit log', icon: ClipboardList, perm: 'audit.view' },
      { href: '/settings', label: 'Settings', icon: Cog, perm: 'platform.view' },
      { href: '/admins', label: 'Admins', icon: ShieldCheck, perm: 'admins.manage' },
    ],
  },
];

/** Auth gate + console chrome. Unauthenticated or MFA-pending sessions go to /login. */
export function ConsoleShell({ children }: { children: ReactNode }) {
  const me = useMeQuery();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (me.isPending) return;
    if (me.error || !me.data) {
      const code = isApiError(me.error) ? me.error.code : '';
      const reason = code === 'SESSION_EXPIRED' ? 'expired' : 'signin';
      if (isApiError(me.error) && me.error.status === 0) return; // network error: show message instead
      router.replace(`/login?reason=${reason}&next=${encodeURIComponent(pathname)}`);
    } else if (!me.data.mfaVerified) {
      router.replace(`/login?reason=mfa&next=${encodeURIComponent(pathname)}`);
    }
  }, [me.isPending, me.error, me.data, router, pathname]);

  if (me.isPending || !me.data?.mfaVerified) {
    if (isApiError(me.error) && me.error.status === 0)
      return (
        <div className="p-8">
          <p role="alert">{me.error.message}</p>
        </div>
      );
    return <Loading label="Checking admin session…" />;
  }
  return (
    <MeProvider me={me.data}>
      <Chrome>{children}</Chrome>
    </MeProvider>
  );
}

function Chrome({ children }: { children: ReactNode }) {
  const me = useMe();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => setNavOpen(false), [pathname]);

  const nav = (
    <nav aria-label="Admin sections" className="flex flex-col gap-4 px-2 py-3">
      {NAV.map((g) => {
        const items = g.items.filter((i) => me.permissions.includes(i.perm));
        if (!items.length) return null;
        return (
          <div key={g.section}>
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
              {g.section}
            </p>
            <ul className="flex flex-col gap-0.5">
              {items.map((i) => {
                const active =
                  i.href === '/'
                    ? pathname === '/'
                    : pathname === i.href || pathname.startsWith(`${i.href}/`);
                const Icon = i.icon;
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium',
                        active
                          ? 'bg-brand-bg text-brand-strong dark:text-brand-strong'
                          : 'text-fg-muted hover:bg-muted hover:text-fg',
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      {/* Violet top rule: a constant visual cue that this is the platform admin console. */}
      <div className="h-1 bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#4F46E5]" aria-hidden />
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md p-2 text-fg-muted hover:bg-muted lg:hidden"
            aria-label="Open navigation"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            <Menu className="size-4" aria-hidden />
          </button>
          <Link href="/" aria-label="Admin overview">
            <AdminBrand />
          </Link>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="hidden text-xs text-fg-muted sm:inline" data-testid="admin-identity">
            {me.email}
          </span>
          <span
            className="whitespace-nowrap rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted"
            data-testid="admin-role"
          >
            {me.role.replace('_', ' ')}
          </span>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <SupportBanner />
      <div className="flex">
        <aside className="sticky top-12 hidden h-[calc(100vh-3rem)] w-56 shrink-0 overflow-y-auto border-r border-line bg-surface lg:block">
          {nav}
        </aside>
        {navOpen && (
          <div
            className="fixed inset-0 z-40 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-surface shadow-xl">
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <AdminBrand />
                <button
                  type="button"
                  className="rounded p-1.5 hover:bg-muted"
                  aria-label="Close navigation"
                  onClick={() => setNavOpen(false)}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              {nav}
            </div>
          </div>
        )}
        <main id="main" className="min-w-0 flex-1 px-4 py-5 lg:px-6" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

function LogoutButton() {
  const router = useRouter();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={busy}
      icon={<LogOut className="size-4" aria-hidden />}
      onClick={async () => {
        setBusy(true);
        await api('/v1/admin/auth/logout', { method: 'POST', body: {}, silentAuth: true }).catch(
          () => undefined,
        );
        qc.clear();
        router.replace('/login?reason=signedout');
      }}
    >
      <span className="hidden sm:inline">Sign out</span>
    </Button>
  );
}

export function useCountdown(until: string | Date | null | undefined): number {
  const target = until ? new Date(until).getTime() : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.floor((target - now) / 1000));
}

export function fmtCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function isActiveSession(s: SupportSession): boolean {
  return !s.endedAt && new Date(s.expiresAt).getTime() > Date.now();
}

export function useSupportSessions(enabled = true) {
  return useQuery({
    queryKey: ['support-sessions'],
    queryFn: () => get<{ items: SupportSession[] }>('/v1/admin/support-sessions'),
    refetchInterval: 30_000,
    enabled,
  });
}

export function useEndSupportSession() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => post(`/v1/admin/support-sessions/${id}/end`),
    onSuccess: () => {
      toast.success('Support session ended.');
      void qc.invalidateQueries({ queryKey: ['support-sessions'] });
      void qc.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (e) => toast.error(isApiError(e) ? e.message : 'Could not end the session'),
  });
}

/** Prominent, always-visible banner while any support session is open. */
function SupportBanner() {
  const me = useMe();
  const q = useSupportSessions(me.permissions.includes('support.access'));
  const active = (q.data?.items ?? []).filter(isActiveSession);
  if (!active.length) return null;
  return (
    <div
      className="border-b border-warning/40 bg-warning-bg"
      role="region"
      aria-label="Active support sessions"
    >
      {active.map((s) => (
        <SupportBannerRow key={s.id} s={s} />
      ))}
    </div>
  );
}

function SupportBannerRow({ s }: { s: SupportSession }) {
  const left = useCountdown(s.expiresAt);
  const end = useEndSupportSession();
  const qc = useQueryClient();
  useEffect(() => {
    if (left === 0) void qc.invalidateQueries({ queryKey: ['support-sessions'] });
  }, [left, qc]);
  if (left === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[13px]"
      data-testid="support-banner"
    >
      <div className="flex items-center gap-2">
        <Eye className="size-4 text-warning" aria-hidden />
        <span>
          <strong>Support session active</strong> — read-only access, visible to the shop.{' '}
          <span className="tabular font-semibold" aria-live="off">
            {fmtCountdown(left)} remaining
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={`/support/${s.id}`}
          className="font-medium text-brand underline-offset-2 hover:underline"
        >
          Open records
        </Link>
        <Button
          size="sm"
          variant="warning"
          loading={end.isPending}
          onClick={() => end.mutate(s.id)}
        >
          End session
        </Button>
      </div>
    </div>
  );
}
