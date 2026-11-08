'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { localDate, type Permission } from '@csp2all/shared';
import type { ZodError } from 'zod';
import { api, ApiError, newIdempotencyKey } from './api';
import { translateKey, useI18n, type TFn } from './i18n';
import type { Me, TenantContext } from './types';

export const qk = {
  me: ['me'] as const,
  context: ['context'] as const,
};

export function useMe(enabled = true) {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => api<Me>('/v1/auth/me', { noAuthRedirect: true }),
    enabled,
    staleTime: 60_000,
  });
}

export function useTenantContext() {
  return useQuery({
    queryKey: qk.context,
    queryFn: () => api<TenantContext>('/v1/tenant/context'),
    staleTime: 30_000,
  });
}

/** Client-side permission check for hiding controls. The API enforces everything. */
export function usePermissions() {
  const ctx = useTenantContext();
  const set = useMemo(() => new Set(ctx.data?.membership.permissions ?? []), [ctx.data]);
  const can = useCallback((p: Permission) => set.has(p), [set]);
  return { can, ready: !!ctx.data, ctx: ctx.data };
}

/** Today's business date in the shop's timezone. */
export function useToday(): string {
  const ctx = useTenantContext();
  return localDate(new Date(), ctx.data?.tenant.timezone ?? 'Asia/Kolkata');
}

/** One Idempotency-Key per form submission; reused on retry, renewed after success. */
export function useIdempotencyKey() {
  const ref = useRef<string>(newIdempotencyKey());
  return {
    key: () => ref.current,
    reset: () => {
      ref.current = newIdempotencyKey();
    },
  };
}

export type FieldErrors = Record<string, string[]>;

export function zodToFieldErrors(err: ZodError, prefix = ''): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const key = prefix + (issue.path.join('.') || '_');
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

const KNOWN_MESSAGES: Record<string, string> = {
  Required: 'common.required',
  'Enter a 10-digit mobile number': 'msg.mobile',
  'Enter the full account number (9–18 digits)': 'msg.accountNumber',
  'Invalid IFSC': 'msg.ifsc',
  'Use YYYY-MM-DD': 'msg.date',
  'Enter a valid email address': 'msg.email',
  'Must be greater than zero': 'msg.positive',
  'Give a reason': 'msg.reason',
  'Enter your shop name': 'msg.shopName',
  'Enter your name': 'msg.ownerName',
  'Enter a name': 'msg.name',
  'Choose how the amount was collected': 'msg.collectedMethod',
  'Choose two different accounts': 'msg.differentAccounts',
  'Cannot exceed the amount owed': 'msg.exceedsOwed',
  'Select at least one service': 'onboarding.selectOne',
};

/** Maps the shared schemas' English validation messages to translation keys. */
export function localizeMessage(t: TFn, msg: string): string {
  if (KNOWN_MESSAGES[msg]) return t(KNOWN_MESSAGES[msg] as never);
  if (/Aadhaar|card numbers/i.test(msg)) return t('error.SENSITIVE_DATA_REJECTED');
  if (msg.startsWith('Too small')) return t('msg.tooShort');
  if (msg.startsWith('Too big')) return t('msg.tooLong');
  if (msg.startsWith('Invalid')) return t('msg.invalid');
  return msg;
}

/** Translated, user-facing message for any error. */
export function errorMessage(t: TFn, err: unknown): string {
  if (err instanceof ApiError) {
    const key = `error.${err.code}`;
    const tr = translateKey('en', key) !== key ? t(key as never) : null;
    if (err.code === 'VALIDATION_FAILED' && Object.keys(err.fields).length === 0)
      return err.message;
    if (
      err.code === 'CONFLICT' ||
      err.code === 'INVALID_TRANSITION' ||
      err.code === 'NOT_FOUND' ||
      err.code === 'AMOUNT_EXCEEDS_DUE' ||
      err.code === 'RECORD_LOCKED'
    )
      return err.message;
    return tr ?? err.message;
  }
  return t('error.INTERNAL_ERROR');
}

/** Form error state: client (Zod) + server (`fields`) messages keyed by dotted path. */
export function useFormErrors() {
  const { t } = useI18n();
  const [fields, setFields] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<unknown>(null);
  const fromError = useCallback((e: unknown) => {
    if (e instanceof ApiError) setFields(e.fields ?? {});
    setFormError(e);
  }, []);
  const clear = useCallback(() => {
    setFields({});
    setFormError(null);
  }, []);
  return {
    fields,
    setFields,
    formError,
    formMessage: formError ? errorMessage(t, formError) : null,
    fromError,
    clear,
    get: (k: string) => (fields[k]?.[0] ? localizeMessage(t, fields[k][0]) : null),
  };
}
