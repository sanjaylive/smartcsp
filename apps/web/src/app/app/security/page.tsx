'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { formatDateTime } from '@csp2all/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorMessage, useMe, usePermissions } from '@/lib/hooks';
import type { SessionJson } from '@/lib/types';
import { Alert, Badge, Button, Card, CardHeader, DescList, PageHeader } from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { QueryState } from '@/components/query-state';
import { useToast } from '@/components/ui/toast';

function deviceLabel(ua: string | null): string {
  if (!ua) return '—';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return `${browser}${os ? ` · ${os}` : ''}`;
}

export default function SecurityPage() {
  const { t, tk } = useI18n();
  const { ctx } = usePermissions();
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmAll, setConfirmAll] = useState(false);
  const q = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api<{ items: SessionJson[] }>('/v1/auth/sessions'),
  });
  const revoke = useMutation({
    mutationFn: (s: SessionJson) => api(`/v1/auth/sessions/${s.id}`, { method: 'DELETE' }),
    onSuccess: (_r, s) => {
      if (s.current) {
        qc.clear();
        window.location.assign('/login');
        return;
      }
      toast('success', t('security.revoked'));
      void qc.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  const logoutAll = useMutation({
    mutationFn: () => api('/v1/auth/logout-all', { method: 'POST' }),
    onSuccess: () => {
      qc.clear();
      window.location.assign('/login');
    },
    onError: (e) => toast('error', errorMessage(t, e)),
  });
  const tz = ctx?.tenant.timezone;
  return (
    <>
      <PageHeader title={t('nav.security')} description={t('security.help')} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader
            title={t('auth.sessions.title')}
            actions={
              <Button
                variant="danger"
                size="sm"
                icon={<LogOut aria-hidden className="size-4" />}
                onClick={() => setConfirmAll(true)}
              >
                {t('auth.sessions.logoutAll')}
              </Button>
            }
          />
          <QueryState query={q}>
            {(d) => (
              <ul className="divide-y divide-border" data-testid="sessions">
                {d.items.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <MonitorSmartphone aria-hidden className="size-5 text-fg-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {s.deviceName ?? deviceLabel(s.userAgent)}{' '}
                        {s.current ? (
                          <Badge tone="brand">{t('auth.sessions.current')}</Badge>
                        ) : null}
                      </p>
                      <p className="text-[13px] text-fg-muted">
                        {tk(`sessionKind.${s.kind}`)} ·{' '}
                        {t('security.started', { at: formatDateTime(s.createdAt, tz) })} ·{' '}
                        {t('security.lastSeen', { at: formatDateTime(s.lastSeenAt, tz) })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => revoke.mutate(s)}
                      loading={revoke.isPending && revoke.variables?.id === s.id}
                    >
                      {t('auth.sessions.revoke')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </Card>
        <Card className="p-5">
          <p className="mb-3 flex items-center gap-2 font-bold">
            <ShieldCheck aria-hidden className="size-5 text-success" />
            {t('security.account')}
          </p>
          {me.data ? (
            <DescList
              items={[
                { label: t('auth.email.label'), value: me.data.user.email },
                { label: t('security.signIn'), value: t('security.emailOtp') },
              ]}
            />
          ) : null}
          <Alert tone="info" className="mt-4">
            {t('security.cookiesNote')}
          </Alert>
        </Card>
      </div>
      <Dialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={t('auth.sessions.logoutAll')}
        description={t('security.logoutAllHelp')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmAll(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => logoutAll.mutate()}
              loading={logoutAll.isPending}
            >
              {t('auth.sessions.logoutAll')}
            </Button>
          </>
        }
      >
        <p>{t('security.logoutAllConfirm')}</p>
      </Dialog>
    </>
  );
}
