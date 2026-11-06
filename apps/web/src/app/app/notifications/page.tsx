'use client';

import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { formatDateTime } from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { qk, usePermissions } from '@/lib/hooks';
import type { NotificationJson, Page } from '@/lib/types';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { QueryState } from '@/components/query-state';
import { Pagination } from '@/components/pagination';
import { cn } from '@/lib/cn';

export default function NotificationsPage() {
  const { t } = useI18n();
  const { ctx } = usePermissions();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['notifications', page],
    queryFn: () =>
      api<Page<NotificationJson> & { unread: number }>('/v1/notifications', {
        query: { page, pageSize: 20 },
      }),
    placeholderData: keepPreviousData,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    void qc.invalidateQueries({ queryKey: qk.context });
  };
  const readOne = useMutation({
    mutationFn: (id: string) => api(`/v1/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const readAll = useMutation({
    mutationFn: () => api('/v1/notifications/read-all', { method: 'POST' }),
    onSuccess: refresh,
  });
  // Only links into this portal are followed (never arbitrary URLs from notification data).
  const safeLink = (l: string | null) =>
    l && l.startsWith('/app') && !l.startsWith('//') ? l : null;

  return (
    <>
      <PageHeader
        title={t('nav.notifications')}
        actions={
          q.data && q.data.unread > 0 ? (
            <Button
              variant="outline"
              icon={<CheckCheck aria-hidden className="size-4" />}
              onClick={() => readAll.mutate()}
              loading={readAll.isPending}
            >
              {t('notifications.readAll')}
            </Button>
          ) : null
        }
      />
      <QueryState query={q}>
        {(d) =>
          d.items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Bell aria-hidden className="size-6" />}
                title={t('notifications.none')}
              />
            </Card>
          ) : (
            <Card>
              <ul className="divide-y divide-border">
                {d.items.map((n) => {
                  const link = safeLink(n.link);
                  return (
                    <li
                      key={n.id}
                      className={cn(
                        'flex flex-wrap items-start gap-3 px-5 py-4',
                        !n.readAt && 'bg-brand-bg/40',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mt-2 size-2.5 shrink-0 rounded-full',
                          n.readAt ? 'bg-transparent' : 'bg-brand',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {n.title}{' '}
                          {!n.readAt ? <Badge tone="brand">{t('notifications.new')}</Badge> : null}
                        </p>
                        {n.body ? <p className="text-sm whitespace-pre-line">{n.body}</p> : null}
                        <p className="mt-1 text-[13px] text-fg-muted">
                          {formatDateTime(n.createdAt, ctx?.tenant.timezone)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {link ? (
                          <Link
                            href={link}
                            onClick={() => !n.readAt && readOne.mutate(n.id)}
                            className="inline-flex min-h-9 items-center rounded-[10px] px-3 text-sm font-semibold text-brand hover:bg-surface-muted"
                          >
                            {t('notifications.open')}
                          </Link>
                        ) : null}
                        {!n.readAt ? (
                          <Button size="sm" variant="ghost" onClick={() => readOne.mutate(n.id)}>
                            {t('notifications.markRead')}
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Pagination page={d.page} pages={d.pages} total={d.total} onPage={setPage} />
            </Card>
          )
        }
      </QueryState>
    </>
  );
}
