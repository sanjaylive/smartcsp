'use client';

import { Eye, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  fmtCountdown,
  isActiveSession,
  useCountdown,
  useEndSupportSession,
  useSupportSessions,
} from '@/components/shell';
import { Button, Callout, Loading } from '@/components/ui';
import type { SupportSession } from '@/lib/types';

/** Unmissable read-only banner shown on every support-session page. */
export function useSession(id: string): {
  session: SupportSession | undefined;
  loading: boolean;
  active: boolean;
} {
  const q = useSupportSessions();
  const session = q.data?.items.find((s) => s.id === id);
  return { session, loading: q.isPending, active: !!session && isActiveSession(session) };
}

export function SessionHeader({ id }: { id: string }) {
  const { session, loading, active } = useSession(id);
  const left = useCountdown(session?.expiresAt);
  const end = useEndSupportSession();
  const router = useRouter();
  if (loading) return <Loading label="Loading support session…" />;
  if (!session)
    return (
      <Callout tone="danger" title="Support session not found">
        It may belong to another admin.
      </Callout>
    );
  const live = active && left > 0;
  return (
    <div
      className="mb-4 rounded-lg border-2 border-warning bg-warning-bg px-4 py-3"
      role="region"
      aria-label="Support session status"
      data-testid="readonly-banner"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Lock className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="text-sm font-bold">Read-only support access — visible to the shop</p>
            <p className="text-[13px]">
              Reason: {session.reason}
              {' · '}
              {live ? (
                <span className="tabular font-semibold" data-testid="session-countdown">
                  {fmtCountdown(left)} remaining
                </span>
              ) : (
                <strong>{session.endedAt ? 'Session ended' : 'Session expired'}</strong>
              )}
            </p>
          </div>
        </div>
        {live && (
          <Button
            variant="warning"
            icon={<Eye className="size-4" aria-hidden />}
            loading={end.isPending}
            data-testid="end-session"
            onClick={() => end.mutate(session.id, { onSuccess: () => router.push('/support') })}
          >
            End session
          </Button>
        )}
      </div>
    </div>
  );
}
