'use client';

import {
  CheckCircle2,
  CircleDot,
  Clock,
  CreditCard,
  FileText,
  Files,
  HandCoins,
  IdCard,
  Landmark,
  Receipt,
  Send,
  Smartphone,
  Sparkles,
  UserCheck,
  XCircle,
  Ban,
  type LucideIcon,
} from 'lucide-react';
import { getService, type OpStatus, type PaymentStatus, type PostingStatus } from '@csp2all/shared';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';
import { Badge } from './ui';

const ICONS: Record<string, LucideIcon> = {
  smartphone: Smartphone,
  send: Send,
  receipt: Receipt,
  'id-card': IdCard,
  'user-check': UserCheck,
  files: Files,
  'hand-coins': HandCoins,
  'credit-card': CreditCard,
  landmark: Landmark,
  sparkles: Sparkles,
};

export function serviceAccent(code: string): string {
  return getService(code)?.accent ?? 'slate';
}

export function ServiceIcon({
  code,
  size = 'md',
  className,
}: {
  code: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const def = getService(code);
  const Icon = (def && ICONS[def.icon]) || FileText;
  const box =
    size === 'sm'
      ? 'size-8 rounded-lg'
      : size === 'lg'
        ? 'size-12 rounded-2xl'
        : 'size-10 rounded-xl';
  const ic = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-6' : 'size-5';
  return (
    <span
      aria-hidden
      className={cn(
        `accent-${def?.accent ?? 'slate'}`,
        'inline-flex shrink-0 items-center justify-center bg-acc-bg text-acc-fg',
        box,
        className,
      )}
    >
      <Icon className={ic} />
    </span>
  );
}

export function useServiceLabel() {
  const { tk } = useI18n();
  return (code: string, customName?: string | null) =>
    code === 'CUSTOM' && customName ? customName : tk(getService(code)?.labelKey ?? code);
}

export function ServiceName({ code, customName }: { code: string; customName?: string | null }) {
  const label = useServiceLabel();
  return (
    <span className="inline-flex items-center gap-2">
      <ServiceIcon code={code} size="sm" />
      <span className="font-medium">{label(code, customName)}</span>
    </span>
  );
}

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'> =
  {
    DRAFT: 'neutral',
    PENDING: 'warning',
    SUCCESSFUL: 'success',
    FAILED: 'danger',
    CANCELLED: 'neutral',
    SUBMITTED: 'info',
    IN_PROGRESS: 'warning',
    COMPLETED: 'success',
    REJECTED: 'danger',
  };

function statusIcon(s: string) {
  if (s === 'SUCCESSFUL' || s === 'COMPLETED')
    return <CheckCircle2 aria-hidden className="size-3.5" />;
  if (s === 'FAILED' || s === 'REJECTED') return <XCircle aria-hidden className="size-3.5" />;
  if (s === 'CANCELLED') return <Ban aria-hidden className="size-3.5" />;
  if (s === 'PENDING' || s === 'IN_PROGRESS' || s === 'SUBMITTED')
    return <Clock aria-hidden className="size-3.5" />;
  return <CircleDot aria-hidden className="size-3.5" />;
}

export function StatusBadge({ status }: { status: OpStatus | string }) {
  const { tk } = useI18n();
  return (
    <Badge tone={STATUS_TONE[status] ?? 'neutral'} icon={statusIcon(status)}>
      {tk(`status.${status}`)}
    </Badge>
  );
}

export function PaymentBadge({ status }: { status: PaymentStatus | string }) {
  const { tk } = useI18n();
  const tone =
    status === 'PAID'
      ? 'success'
      : status === 'PARTIAL'
        ? 'warning'
        : status === 'UNPAID'
          ? 'danger'
          : 'neutral';
  return (
    <Badge
      tone={tone}
      icon={
        status === 'PAID' ? (
          <CheckCircle2 aria-hidden className="size-3.5" />
        ) : (
          <CircleDot aria-hidden className="size-3.5" />
        )
      }
    >
      {tk(`payment.${status}`)}
    </Badge>
  );
}

export function PostingBadge({ status }: { status: PostingStatus | string }) {
  const { t } = useI18n();
  const label =
    status === 'POSTED'
      ? t('record.posted')
      : status === 'REVERSED'
        ? t('record.reversed')
        : status === 'NOT_REQUIRED'
          ? t('posting.notRequired')
          : t('record.unposted');
  const tone = status === 'POSTED' ? 'brand' : status === 'REVERSED' ? 'warning' : 'neutral';
  return <Badge tone={tone}>{label}</Badge>;
}
