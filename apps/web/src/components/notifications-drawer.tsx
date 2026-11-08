'use client';

/* Notifications drawer opened from the bell: All / Unread, grouped by day, mark read, open links. */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  CalendarClock,
  CheckCheck,
  ChevronRight,
  CreditCard,
  Download,
  LifeBuoy,
  LockOpen,
  Scale,
  SlidersHorizontal,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { formatDateTime } from '@csp2all/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/hooks';
import type { NotificationJson, Page } from '@/lib/types';
import { cn } from '@/lib/cn';
import { Button, Skeleton } from './ui';
import { Drawer } from './ui/dialog';

type Feed = Page<NotificationJson> & { unread: number };

const KIND: Record<string, { icon: LucideIcon; tone: string; label: string }> = {
  FOLLOWUPS_DUE: { icon: CalendarClock, tone: 'bg-info-bg text-info', label: 'Follow-ups' },
  SUBSCRIPTION: { icon: CreditCard, tone: 'bg-warning-bg text-warning', label: 'Billing' },
  EXPORT_READY: { icon: Download, tone: 'bg-success-bg text-success', label: 'Export' },
  SUPPORT_ACCESS: { icon: LifeBuoy, tone: 'bg-warning-bg text-warning', label: 'Support' },
  CLOSING_VARIANCE: { icon: Scale, tone: 'bg-danger-bg text-danger', label: 'Closing' },
  CLOSING_VARIANCE_REVERSAL: { icon: Scale, tone: 'bg-info-bg text-info', label: 'Closing' },
  REOPEN_REQUESTED: { icon: LockOpen, tone: 'bg-warning-bg text-warning', label: 'Closing' },
  TENANT_STATUS: { icon: Store, tone: 'bg-danger-bg text-danger', label: 'Shop' },
  OVERRIDE_SET: { icon: SlidersHorizontal, tone: 'bg-info-bg text-info', label: 'Plan' },
};
const kindOf = (type: string) =>
  KIND[type] ?? { icon: Bell, tone: 'bg-brand-bg text-brand', label: 'Update' };

/** Only links into this portal are followed (never arbitrary URLs from notification data). */
const safeLink = (l: string | null) =>
  l && l.startsWith('/app') && !l.startsWith('//') ? l : null;

function ago(iso: string, tz?: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return formatDateTime(iso, tz);
}

function dayGroup(iso: string) {
  const d = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (d >= start) return 'Today';
  const y = new Date(start);
  y.setDate(y.getDate() - 1);
  if (d >= y) return 'Yesterday';
  const w = new Date(start);
  w.setDate(w.getDate() - 7);
  return d >= w ? 'This week' : 'Earlier';
}

export function NotificationsDrawer({
  open,
  onOpenChange,
  timezone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  timezone?: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'all' | 'unread'>('all');

  const feed = useInfiniteQuery({
    queryKey: ['notifications', 'feed', tab],
    queryFn: ({ pageParam }) =>
      api<Feed>('/v1/notifications', {
        query: { page: pageParam, pageSize: 15, ...(tab === 'unread' ? { unread: 'true' } : {}) },
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    enabled: open,
    refetchInterval: open ? 30_000 : false,
  });
  const items = useMemo(() => feed.data?.pages.flatMap((p) => p.items) ?? [], [feed.data]);
  const unread = feed.data?.pages[0]?.unread ?? 0;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    void qc.invalidateQueries({ queryKey: qk.context });
  };
  const readOne = useMutation({
    mutationFn: (id: string) => api(`/v1/notifications/${id}/read`, { method: 'POST' }),
    onMutate: (id) => {
      // Optimistic: the dot disappears immediately.
      qc.setQueriesData<{ pages: Feed[] }>({ queryKey: ['notifications', 'feed'] }, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((p) => ({
                ...p,
                unread: Math.max(0, p.unread - 1),
                items: p.items.map((n) =>
                  n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n,
                ),
              })),
            }
          : old,
      );
    },
    onSettled: refresh,
  });
  const readAll = useMutation({
    mutationFn: () => api('/v1/notifications/read-all', { method: 'POST' }),
    onSettled: refresh,
  });

  const openItem = (n: NotificationJson) => {
    if (!n.readAt) readOne.mutate(n.id);
    const link = safeLink(n.link);
    if (link) {
      onOpenChange(false);
      router.push(link);
    }
  };

  const groups = useMemo(() => {
    const out: { label: string; items: NotificationJson[] }[] = [];
    for (const n of items) {
      const label = dayGroup(n.createdAt);
      const g = out.at(-1);
      if (g?.label === label) g.items.push(n);
      else out.push({ label, items: [n] });
    }
    return out;
  }, [items]);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Notifications"
      description={unread ? `${unread} unread` : 'You’re all caught up'}
      icon={
        <span className="relative grid size-10 place-items-center rounded-xl bg-brand-bg text-brand">
          <Bell aria-hidden className="size-5" />
          {unread ? (
            <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-surface dark:text-bg">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </span>
      }
      steps={
        <div className="flex items-center gap-2">
          <div
            role="tablist"
            aria-label="Filter"
            className="flex gap-1 rounded-xl bg-surface-muted p-1"
          >
            {(['all', 'unread'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={cn(
                  'inline-flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition',
                  tab === k ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
                )}
              >
                {k === 'all' ? 'All' : 'Unread'}
                {k === 'unread' && unread ? (
                  <span className="rounded-full bg-brand px-1.5 text-[10px] leading-4 font-bold text-on-brand">
                    {unread}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          {unread ? (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-brand"
              loading={readAll.isPending}
              icon={<CheckCheck aria-hidden className="size-4" />}
              onClick={() => readAll.mutate()}
            >
              Mark all read
            </Button>
          ) : null}
        </div>
      }
    >
      {feed.isPending ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-10 rounded-xl" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : feed.isError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-fg-muted">Couldn’t load notifications.</p>
          <Button size="sm" variant="outline" onClick={() => void feed.refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-surface-muted text-fg-muted">
            <BellOff aria-hidden className="size-7" />
          </span>
          <p className="font-semibold">
            {tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </p>
          <p className="max-w-64 text-sm text-fg-muted">
            Follow-up reminders, closing alerts, exports and billing updates will show up here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <section key={g.label} className="flex flex-col gap-1.5">
              <h3 className="px-1 text-[11px] font-bold tracking-wider text-fg-muted uppercase">
                {g.label}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {g.items.map((n) => {
                  const k = kindOf(n.type);
                  const link = safeLink(n.link);
                  return (
                    <li key={n.id}>
                      <div
                        className={cn(
                          'group relative flex gap-3 rounded-2xl border p-3 transition',
                          n.readAt
                            ? 'border-transparent hover:bg-surface-muted'
                            : 'border-brand/20 bg-brand-bg/40 hover:bg-brand-bg/70',
                        )}
                      >
                        <span
                          className={cn(
                            'grid size-10 shrink-0 place-items-center rounded-xl',
                            k.tone,
                          )}
                        >
                          <k.icon aria-hidden className="size-[18px]" />
                        </span>
                        <button
                          type="button"
                          onClick={() => openItem(n)}
                          className="min-w-0 flex-1 text-left after:absolute after:inset-0 after:rounded-2xl after:content-['']"
                        >
                          <span className="flex items-start gap-2">
                            <span
                              className={cn(
                                'flex-1 text-sm leading-snug',
                                n.readAt ? 'font-medium' : 'font-bold',
                              )}
                            >
                              {n.title}
                            </span>
                            {!n.readAt ? (
                              <span
                                aria-label="Unread"
                                className="mt-1.5 size-2 shrink-0 rounded-full bg-brand"
                              />
                            ) : null}
                          </span>
                          {n.body ? (
                            <span className="mt-0.5 line-clamp-2 block text-[13px] text-fg-muted">
                              {n.body}
                            </span>
                          ) : null}
                          <span className="mt-1.5 flex items-center gap-2 text-[11px] text-fg-muted">
                            <span className="rounded-full bg-surface-muted px-1.5 py-0.5 font-semibold">
                              {k.label}
                            </span>
                            <time
                              dateTime={n.createdAt}
                              title={formatDateTime(n.createdAt, timezone)}
                            >
                              {ago(n.createdAt, timezone)}
                            </time>
                            {link ? (
                              <span className="ml-auto inline-flex items-center font-semibold text-brand">
                                Open <ChevronRight aria-hidden className="size-3.5" />
                              </span>
                            ) : null}
                          </span>
                        </button>
                        {!n.readAt && !link ? (
                          <button
                            type="button"
                            onClick={() => readOne.mutate(n.id)}
                            className="relative z-10 self-center rounded-md px-2 py-1 text-[11px] font-bold text-brand opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                          >
                            Mark read
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {feed.hasNextPage ? (
            <Button
              variant="outline"
              loading={feed.isFetchingNextPage}
              onClick={() => void feed.fetchNextPage()}
            >
              Load more
            </Button>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}
