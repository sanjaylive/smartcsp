'use client';

import { useQuery } from '@tanstack/react-query';
import { feeFromSlabs, type ServiceCode } from '@csp2all/shared';
import { api } from './api';
import type { MasterKind, ShopMaster } from './types';

export const mastersKey = ['masters'] as const;

/** The shop's own lists (expense categories, payment modes, providers, fee presets). */
export function useMasters() {
  const q = useQuery({
    queryKey: mastersKey,
    queryFn: () => api<{ items: ShopMaster[] }>('/v1/masters'),
    staleTime: 60_000,
  });
  const all = q.data?.items ?? [];
  const active = (kind: MasterKind) => all.filter((m) => m.kind === kind && m.active);
  return {
    query: q,
    all,
    active,
    /** Payment modes that land in the given fund account. */
    paymentModesFor: (account: 'CASH' | 'BANK' | 'FLOAT') =>
      active('PAYMENT_MODE').filter((m) => m.data.account === account),
    /** Providers for a service (a provider with no services listed applies to all). */
    providersFor: (code: ServiceCode) =>
      active('PROVIDER').filter((m) => !m.data.services?.length || m.data.services.includes(code)),
    /** First active fee preset for a service, and the fee it gives for an amount. */
    feeFor: (code: ServiceCode, amountPaise: number) => {
      const preset = active('FEE_PRESET').find((m) => m.data.serviceCode === code);
      if (!preset?.data.slabs) return null;
      const fee = feeFromSlabs(preset.data.slabs, amountPaise);
      return fee === null ? null : { fee, preset };
    },
  };
}

/** Fund account that a record/collection payment method lands in (mirrors the API ledger rule). */
export function accountForMethod(method: string): 'CASH' | 'BANK' | 'FLOAT' | null {
  if (method === 'CASH') return 'CASH';
  if (method === 'UPI' || method === 'BANK') return 'BANK';
  if (method === 'FLOAT') return 'FLOAT';
  return null;
}
