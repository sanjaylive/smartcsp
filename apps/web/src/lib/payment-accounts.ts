'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { PaymentAccount, SignedUrl } from './types';

export const paymentAccountsKey = ['payment-accounts'] as const;

/** The shop's own UPI IDs and bank accounts. */
export function usePaymentAccounts() {
  const q = useQuery({
    queryKey: paymentAccountsKey,
    queryFn: () => api<{ items: PaymentAccount[] }>('/v1/payment-accounts'),
    staleTime: 60_000,
  });
  const all = q.data?.items ?? [];
  const active = all.filter((a) => a.active);
  return {
    query: q,
    all,
    upi: active.filter((a) => a.kind === 'UPI'),
    bank: active.filter((a) => a.kind === 'BANK'),
  };
}

/**
 * Short-lived link to an uploaded image (e.g. a payment QR). Freshly uploaded files are briefly
 * quarantined while scanned, so a "still being checked" answer is retried.
 */
export function useAttachmentUrl(id: string | null | undefined) {
  return useQuery({
    queryKey: ['attachment-url', id],
    queryFn: () => api<SignedUrl>(`/v1/attachments/${id}/url`),
    enabled: !!id,
    staleTime: 10 * 60_000,
    retry: (n) => n < 5,
    retryDelay: 1500,
  });
}

export const UPI_APP_LABEL: Record<string, string> = {
  PHONEPE: 'PhonePe',
  PAYTM: 'Paytm',
  GPAY: 'Google Pay',
  BHIM: 'BHIM',
  BHARATPE: 'BharatPe',
  AMAZONPAY: 'Amazon Pay',
  OTHER: 'Other UPI app',
};

/** Brand-ish colour chip per UPI app (flat, no logos). */
export const UPI_APP_COLOR: Record<string, string> = {
  PHONEPE: '#5f259f',
  PAYTM: '#00baf2',
  GPAY: '#1a73e8',
  BHIM: '#f37021',
  BHARATPE: '#00b9a5',
  AMAZONPAY: '#232f3e',
  OTHER: '#64748b',
};

export const maskAccount = (n: string | null | undefined) => (n ? `••••${n.slice(-4)}` : '');
