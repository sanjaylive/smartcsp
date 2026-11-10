'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as RD from '@radix-ui/react-dialog';
import * as DM from '@radix-ui/react-dropdown-menu';
import {
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  ChartColumn,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  HandCoins,
  Layers,
  ListChecks,
  LayoutDashboard,
  Menu,
  Plus,
  PlugZap,
  QrCode,
  ReceiptIndianRupee,
  ShieldCheck,
  Store,
  UserCog,
  Users,
  Wallet,
  BadgeIndianRupee,
  X,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { formatDateTime } from '@csp2all/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { qk, useMe, useTenantContext } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import type { Me, TenantContext } from '@/lib/types';
import { LanguageToggle, Logo, ThemeToggle } from './toggles';
import { ServiceIcon, useServiceLabel } from './service';
import { Alert, Badge } from './ui';
import { ErrorBlock, LoadingBlock } from './query-state';
import { NewRecordLink } from '@/components/record-wizard';
import { NotificationsDrawer } from './notifications-drawer';
import { ProfileDrawer, initialsOf } from './profile-drawer';

const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  records: FileText,
  customers: Users,
  followUps: CalendarClock,
  dues: HandCoins,
  cashbook: BookOpen,
  expenses: ReceiptIndianRupee,
  commissions: BadgeIndianRupee,
  closing: CalendarCheck,
  reports: ChartColumn,
  staff: UserCog,
  subscription: Wallet,
  shop: Store,
  services: Layers,
  masters: ListChecks,
  payments: QrCode,
  integrations: PlugZap,
  notifications: Bell,
  security: ShieldCheck,
  audit: History,
};

const GROUPS: Array<{ key: string; items: string[] }> = [
  { key: 'navGroup.work', items: ['dashboard', 'records', 'customers', 'followUps', 'dues'] },
  { key: 'navGroup.money', items: ['cashbook', 'expenses', 'commissions', 'closing', 'reports'] },
  {
    key: 'navGroup.shop',
    items: [
      'staff',
      'subscription',
      'shop',
      'services',
      'masters',
      'payments',
      'integrations',
      'audit',
    ],
  },
  { key: 'navGroup.account', items: ['notifications', 'security'] },
];

function isActive(pathname: string, path: string) {
  if (path === '/app') return pathname === '/app';
  return pathname === path || pathname.startsWith(`${path}/`);
}

function NavList({
  ctx,
  onNavigate,
  collapsed = false,
}: {
  ctx: TenantContext;
  onNavigate?: () => void;
  /** Icon-only rail: labels become tooltips and screen-reader text. */
  collapsed?: boolean;
}) {
  const { tk, t } = useI18n();
  const pathname = usePathname();
  const params = useSearchParams();
  const label = useServiceLabel();
  const allowed = new Map(ctx.navigation.map((n) => [n.key, n.path]));
  const currentService = pathname === '/app/records' ? params.get('service') : null;
  return (
    <nav aria-label={t('a11y.mainNav')} className="flex flex-col gap-4">
      {GROUPS.map((g) => {
        const items = g.items.filter((k) => allowed.has(k));
        if (!items.length) return null;
        return (
          <div key={g.key}>
            {collapsed ? (
              <div aria-hidden className="mx-3 mb-2 h-px bg-border" />
            ) : (
              <p className="px-3 pb-1 text-[11px] font-bold tracking-wider text-fg-muted/80 uppercase">
                {tk(g.key)}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {items.map((k) => {
                const path = allowed.get(k)!;
                const Icon = NAV_ICONS[k] ?? FileText;
                const active = isActive(pathname, path) && !(k === 'records' && currentService);
                return (
                  <li key={k}>
                    <Link
                      href={path}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? tk(`nav.${k}`) : undefined}
                      className={cn(
                        'relative flex min-h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors',
                        collapsed && 'justify-center px-0',
                        active
                          ? 'bg-brand-bg font-semibold text-brand-strong dark:text-fg'
                          : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                      )}
                    >
                      <Icon aria-hidden className="size-[18px] shrink-0" />
                      <span className={cn('flex-1', collapsed && 'sr-only')}>{tk(`nav.${k}`)}</span>
                      {k === 'notifications' && ctx.unreadNotifications > 0 ? (
                        collapsed ? (
                          <span
                            aria-hidden
                            className="absolute top-1.5 right-2.5 size-2 rounded-full bg-danger"
                          />
                        ) : (
                          <Badge tone="danger">{ctx.unreadNotifications}</Badge>
                        )
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {ctx.serviceNavigation.length > 0 && allowed.has('records') ? (
        <div>
          {collapsed ? (
            <div aria-hidden className="mx-3 mb-2 h-px bg-border" />
          ) : (
            <p className="px-3 pb-1 text-[11px] font-bold tracking-wider text-fg-muted/80 uppercase">
              {t('navGroup.services')}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {ctx.serviceNavigation.map((s) => (
              <li key={s.code}>
                <Link
                  href={s.path}
                  onClick={onNavigate}
                  aria-current={currentService === s.code ? 'page' : undefined}
                  title={collapsed ? label(s.code) : undefined}
                  className={cn(
                    'flex min-h-9 items-center gap-2.5 rounded-lg px-3 text-sm',
                    collapsed && 'justify-center px-0',
                    currentService === s.code
                      ? 'bg-surface-muted font-semibold'
                      : 'hover:bg-surface-muted',
                  )}
                >
                  <ServiceIcon code={s.code} size="sm" />
                  <span className={cn('flex-1 truncate', collapsed && 'sr-only')}>
                    {label(s.code)}
                  </span>
                  {!s.canCreate ? (
                    <span className="sr-only">{t('service.historyOnly')}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}

function ShopSwitcher({ me, ctx }: { me: Me; ctx: TenantContext }) {
  const { t, tk } = useI18n();
  const qc = useQueryClient();
  const router = useRouter();
  const switchTo = async (tenantId: string) => {
    if (tenantId === me.activeTenantId) return;
    const res = await api<Me>('/v1/auth/select-tenant', { method: 'POST', body: { tenantId } });
    qc.clear();
    qc.setQueryData(qk.me, res);
    router.replace('/app');
  };
  return (
    <DM.Root>
      <DM.Trigger
        className="flex min-h-10 max-w-[60vw] items-center gap-2 rounded-lg px-2 text-left hover:bg-surface-muted sm:max-w-xs"
        aria-label={t('shell.switchShop')}
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-bg text-brand-strong dark:text-fg"
          style={
            ctx.tenant.brandColor ? { background: ctx.tenant.brandColor, color: '#fff' } : undefined
          }
        >
          <Store aria-hidden className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold" data-testid="shop-name">
            {ctx.tenant.name}
          </span>
          <span className="block truncate text-xs text-fg-muted">
            {tk(`role.${ctx.membership.role}`)}
          </span>
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-fg-muted" />
      </DM.Trigger>
      <DM.Portal>
        <DM.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-64 rounded-xl border border-border bg-surface p-1 shadow-xl"
        >
          <DM.Label className="px-3 py-2 text-xs font-bold text-fg-muted uppercase">
            {t('auth.tenant.title')}
          </DM.Label>
          {me.tenants.map((m) => (
            <DM.Item
              key={m.tenantId}
              onSelect={() => void switchTo(m.tenantId)}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-none data-[highlighted]:bg-surface-muted"
            >
              <span className="flex-1">
                <span className="block font-semibold">{m.name}</span>
                <span className="block text-xs text-fg-muted">{tk(`role.${m.role}`)}</span>
              </span>
              {m.tenantId === me.activeTenantId ? (
                <Check aria-label={t('shell.current')} className="size-4 text-brand" />
              ) : null}
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function AvatarButton({ me, onClick }: { me: Me; onClick: () => void }) {
  const { t } = useI18n();
  const identity = me.user.displayName ?? me.user.email ?? me.user.phone ?? '?';
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-full ring-brand/30 transition hover:ring-4"
      aria-label={t('shell.account')}
      aria-haspopup="dialog"
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-brand-alt text-[13px] font-bold text-white dark:text-bg">
        {initialsOf(identity)}
      </span>
    </button>
  );
}

function Banners({ ctx }: { ctx: TenantContext }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      {ctx.tenant.status !== 'ACTIVE' ? (
        <Alert tone="danger" title={t('banner.suspendedTitle')}>
          <p data-testid="suspended-banner">
            {t('banner.suspended')}
            {ctx.tenant.statusReason
              ? ` ${t('banner.reason', { reason: ctx.tenant.statusReason })}`
              : ''}
          </p>
        </Alert>
      ) : null}
      {ctx.supportAccessActive.map((s) => (
        <Alert key={s.id} tone="warning" title={t('banner.supportTitle')}>
          <span className="inline-flex items-start gap-2" data-testid="support-banner">
            {t('banner.support', {
              until: formatDateTime(s.expiresAt, ctx.tenant.timezone),
              reason: s.reason,
            })}
          </span>
        </Alert>
      ))}
      {ctx.plan.fallback ? (
        <Alert tone="warning">{t('banner.planFallback', { plan: ctx.plan.name })}</Alert>
      ) : null}
      {ctx.announcements.map((a) => (
        <Alert
          key={a.id}
          tone={
            a.severity === 'CRITICAL' ? 'danger' : a.severity === 'WARNING' ? 'warning' : 'info'
          }
          title={a.title}
        >
          <span className="inline-flex items-start gap-2">
            <span className="whitespace-pre-line">{a.body}</span>
          </span>
        </Alert>
      ))}
    </div>
  );
}

function BottomNav({ ctx, onMore }: { ctx: TenantContext; onMore: () => void }) {
  const { tk, t } = useI18n();
  const pathname = usePathname();
  const allowed = new Map(ctx.navigation.map((n) => [n.key, n.path]));
  const primary = ['dashboard', 'records', allowed.has('dues') ? 'dues' : 'customers'].filter((k) =>
    allowed.has(k),
  );
  const canCreate = ctx.membership.permissions.includes('records.create');
  const item = (k: string) => {
    const Icon = NAV_ICONS[k];
    const path = allowed.get(k)!;
    const active = isActive(pathname, path);
    return (
      <Link
        key={k}
        href={path}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold',
          active ? 'text-brand' : 'text-fg-muted',
        )}
      >
        <Icon aria-hidden className="size-5" />
        <span className="max-w-full truncate px-1">{tk(`nav.${k}`)}</span>
      </Link>
    );
  };
  return (
    <nav
      aria-label={t('a11y.bottomNav')}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
    >
      {primary.slice(0, 2).map(item)}
      {canCreate ? (
        <NewRecordLink
          href="/app/records/new"
          className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-brand"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-brand text-on-brand">
            <Plus aria-hidden className="size-5" />
          </span>
          <span>{t('nav.newRecord')}</span>
        </NewRecordLink>
      ) : null}
      {primary.slice(2).map(item)}
      <button
        type="button"
        onClick={onMore}
        className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-fg-muted"
      >
        <Menu aria-hidden className="size-5" />
        <span>{t('nav.more')}</span>
      </button>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const ctx = useTenantContext();
  const [drawer, setDrawer] = useState(false);
  const [panel, setPanel] = useState<'profile' | 'notifications' | null>(null);
  // Unread count stays fresh between context loads.
  const unreadQ = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () =>
      api<{ unread: number }>('/v1/notifications', { query: { page: 1, pageSize: 1 } }),
    enabled: !!ctx.data,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  // Desktop sidebar can shrink to an icon rail; remembered per browser.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('csp_nav_collapsed') === '1');
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggleNav = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem('csp_nav_collapsed', c ? '0' : '1');
      } catch {
        /* storage unavailable */
      }
      return !c;
    });

  useEffect(() => {
    if (me.data?.onboarding && me.data.tenants.length === 0) router.replace('/onboarding');
  }, [me.data, router]);
  useEffect(() => {
    setDrawer(false);
    setPanel(null);
  }, [pathname]);

  if (me.isPending || ctx.isPending) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <LoadingBlock rows={5} />
      </div>
    );
  }
  if (me.isError || ctx.isError) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <ErrorBlock
          error={me.error ?? ctx.error}
          onRetry={() => (me.isError ? me.refetch() : ctx.refetch())}
        />
      </div>
    );
  }
  const c = ctx.data;
  const m = me.data;
  const canCreate = c.membership.permissions.includes('records.create');
  const unread = unreadQ.data?.unread ?? c.unreadNotifications;

  return (
    <div
      className={cn(
        'min-h-dvh overflow-x-clip transition-[padding] duration-200',
        collapsed ? 'lg:pl-16' : 'lg:pl-60',
        'print:pl-0',
      )}
    >
      <a href="#main" className="skip-link">
        {t('a11y.skip')}
      </a>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-surface transition-[width] duration-200 lg:flex print:hidden',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <div
          className={cn(
            'flex h-14 shrink-0 items-center border-b border-border',
            collapsed ? 'justify-center px-2' : 'px-4',
          )}
        >
          <Logo href="/app" compact={collapsed} />
        </div>
        <div
          className={cn(
            'flex-1 overflow-x-hidden overflow-y-auto py-4',
            collapsed ? 'px-2' : 'px-2.5',
          )}
        >
          <NavList ctx={c} collapsed={collapsed} />
        </div>
        {/* small round toggle sitting on the sidebar's right border, level with the header line */}
        <button
          type="button"
          onClick={toggleNav}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
          className="absolute top-14 -right-3 z-10 grid size-6 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface text-fg-muted shadow-sm transition hover:border-brand/50 hover:text-brand focus-visible:text-brand"
        >
          {collapsed ? (
            <ChevronRight aria-hidden className="size-3.5" strokeWidth={2.5} />
          ) : (
            <ChevronLeft aria-hidden className="size-3.5" strokeWidth={2.5} />
          )}
        </button>
      </aside>
      <RD.Root open={drawer} onOpenChange={setDrawer}>
        <RD.Portal>
          <RD.Overlay className="fixed inset-0 z-50 bg-black/45 lg:hidden" />
          <RD.Content className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-80 flex-col bg-surface shadow-2xl lg:hidden">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <RD.Title asChild>
                <span>
                  <Logo href="/app" />
                </span>
              </RD.Title>
              <RD.Description className="sr-only">{t('a11y.mainNav')}</RD.Description>
              <RD.Close
                className="flex size-11 items-center justify-center rounded-lg hover:bg-surface-muted"
                aria-label={t('common.close')}
              >
                <X aria-hidden className="size-5" />
              </RD.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <NavList ctx={c} onNavigate={() => setDrawer(false)} />
            </div>
            <div className="flex items-center gap-1 border-t border-border px-3 py-2">
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </RD.Content>
        </RD.Portal>
      </RD.Root>

      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur print:hidden">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-lg hover:bg-surface-muted lg:hidden"
            aria-label={t('shell.openMenu')}
            onClick={() => setDrawer(true)}
          >
            <Menu aria-hidden className="size-5" />
          </button>
          <ShopSwitcher me={m} ctx={c} />
          <div className="ml-auto flex items-center gap-1">
            {canCreate ? (
              <NewRecordLink
                href="/app/records/new"
                className="mr-1 hidden min-h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-semibold text-on-brand shadow-sm hover:bg-brand-strong sm:inline-flex"
              >
                <Plus aria-hidden className="size-4" />
                {t('nav.newRecord')}
              </NewRecordLink>
            ) : null}
            <span className="hidden items-center gap-1 sm:flex">
              <LanguageToggle />
              <ThemeToggle />
            </span>
            <button
              type="button"
              onClick={() => setPanel('notifications')}
              aria-haspopup="dialog"
              className={cn(
                'relative flex size-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-fg',
                panel === 'notifications' && 'bg-surface-muted text-fg',
              )}
              aria-label={t('shell.notifications', { count: unread })}
            >
              <Bell aria-hidden className={cn('size-[18px]', unread > 0 && 'bell-ring')} />
              {unread > 0 ? (
                <span
                  aria-hidden
                  className="absolute top-0.5 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white ring-2 ring-surface dark:text-bg"
                >
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : null}
            </button>
            <AvatarButton me={m} onClick={() => setPanel('profile')} />
          </div>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-[1400px] px-4 pt-4 pb-28 sm:px-6 lg:pb-10 print:max-w-none print:p-0"
      >
        <div className="print:hidden">
          <Banners ctx={c} />
        </div>
        <div
          className={cn(
            c.supportAccessActive.length ||
              c.announcements.length ||
              c.tenant.status !== 'ACTIVE' ||
              c.plan.fallback
              ? 'mt-5'
              : '',
          )}
        >
          {children}
        </div>
      </main>
      <BottomNav ctx={c} onMore={() => setDrawer(true)} />
      <NotificationsDrawer
        open={panel === 'notifications'}
        onOpenChange={(o) => setPanel(o ? 'notifications' : null)}
        timezone={c.tenant.timezone}
      />
      <ProfileDrawer
        open={panel === 'profile'}
        onOpenChange={(o) => setPanel(o ? 'profile' : null)}
        me={m}
        ctx={c}
      />
    </div>
  );
}
