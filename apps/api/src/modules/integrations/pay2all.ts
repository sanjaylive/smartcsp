/*
 * Pay2All connector — built only from the published developer reference (https://pay2all.in/developers):
 *
 *   Base URL     https://pay2all.in/api/v1
 *   Auth         Authorization: Bearer <API token>      (token from Pay2All → Developer → API token)
 *   Test mode    X-Mode: UAT header (Recharge only; bill payment and verification are LIVE only)
 *   Envelope     { status_id: 1 success | 2 failed | 3 pending, message, data }
 *
 *   Recharge      POST /recharge          client_id, provider_id, number, amount
 *   Bill payment  POST /bbps/pay          client_id, biller_id, reference_id, params, amount, mobile
 *                 GET  /bbps/transactions/:clientId   (status check)
 *   Verify        POST /verify/bank_account  client_id, provider_id, number, ifsc
 *   Catalog       GET /providers · POST /lookup · GET /plans · GET /bbps/categories|billers|billers/:id
 *                 POST /bbps/fetch
 *   Balance       GET /balance
 *
 * Not implemented, on purpose: DMT and AEPS. The reference names those endpoints but documents no
 * request or response fields, and we never guess the shape of a money-moving call.
 */

import type { ServiceCode } from '@csp2all/shared';
import { AppError } from '../../common/errors';
import {
  OutcomeUnknownError,
  type AccountVerifyRequest,
  type AccountVerifyResult,
  type ExecuteRequest,
  type ExecuteResult,
  type ProviderAdapter,
  type ProviderResultStatus,
  type StatusResult,
  type WebhookVerification,
} from './providers';

export const PAY2ALL_BASE_URL = 'https://pay2all.in/api/v1';
/** Services Pay2All can run Live today (documented). */
export const PAY2ALL_LIVE_SERVICES: ServiceCode[] = ['RECHARGE', 'BILL_PAYMENT'];
/** Services Pay2All offers but has not documented yet — Offline only for now. */
export const PAY2ALL_PENDING_SERVICES: ServiceCode[] = ['DMT', 'AEPS'];
/** Pay2All's example provider id for bank-account verification (overridable per shop). */
export const PAY2ALL_VERIFY_BANK_PROVIDER = 127;

export interface Pay2AllCredentials {
  apiToken: string;
  /** Provider id for /verify/bank_account (Pay2All example: 127). */
  verifyProviderId?: string;
}

export interface Pay2AllEnvelope<T = unknown> {
  status_id?: number;
  message?: string;
  data?: T;
  [k: string]: unknown;
}

type HttpMethod = 'GET' | 'POST';

export class Pay2AllHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: Pay2AllEnvelope,
  ) {
    super(message);
  }
}

const statusOf = (id: unknown): ProviderResultStatus | null =>
  id === 1 || id === '1'
    ? 'CONFIRMED'
    : id === 2 || id === '2'
      ? 'FAILED'
      : id === 3 || id === '3'
        ? 'PENDING'
        : null;

const rupees = (paise: number) => (paise / 100).toFixed(2);

/** Thin HTTP client. `fetchImpl` is injectable for tests. */
export class Pay2AllClient {
  constructor(
    private readonly creds: Pay2AllCredentials,
    private readonly uat: boolean,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = PAY2ALL_BASE_URL,
  ) {}

  get isUat() {
    return this.uat;
  }

  /**
   * One request. Throws:
   *  - Pay2AllHttpError for an HTTP error response (the request was answered),
   *  - OutcomeUnknownError when no answer arrived (timeout / connection lost after sending).
   */
  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    opts: {
      body?: unknown;
      query?: Record<string, string | number | undefined>;
      timeoutMs: number;
    },
  ): Promise<Pay2AllEnvelope<T>> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {}))
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        signal: ctl.signal,
        headers: {
          authorization: `Bearer ${this.creds.apiToken}`,
          accept: 'application/json',
          ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(this.uat ? { 'x-mode': 'UAT' } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      throw new OutcomeUnknownError(
        (e as Error).name === 'AbortError'
          ? 'Pay2All did not answer in time'
          : `Could not reach Pay2All: ${(e as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }
    let body: Pay2AllEnvelope<T> = {};
    try {
      body = (await res.json()) as Pay2AllEnvelope<T>;
    } catch {
      if (res.ok) throw new OutcomeUnknownError('Pay2All sent an unreadable response');
    }
    if (!res.ok)
      throw new Pay2AllHttpError(
        res.status,
        typeof body.message === 'string' && body.message
          ? body.message
          : res.status === 401
            ? 'Pay2All rejected the API token (or this server’s IP is not whitelisted)'
            : `Pay2All error ${res.status}`,
        body,
      );
    return body;
  }

  /** Read-only call: any failure is reported as a plain, safe-to-retry error. */
  async read<T>(
    method: HttpMethod,
    path: string,
    opts: {
      body?: unknown;
      query?: Record<string, string | number | undefined>;
      timeoutMs: number;
    },
  ): Promise<T> {
    try {
      const r = await this.request<T>(method, path, opts);
      if (r.status_id === 2)
        throw new AppError(
          'CONNECTOR_UNAVAILABLE',
          r.message || 'Pay2All could not complete the lookup',
        );
      return (r.data ?? (r as unknown)) as T;
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(
        'CONNECTOR_UNAVAILABLE',
        (e as Error).message || 'Pay2All is not reachable',
      );
    }
  }
}

/** Fields the record screen sends along for a Live Pay2All operation. */
export interface Pay2AllLiveInput {
  /** Recharge: Pay2All operator id from /providers or /lookup. */
  providerId?: number;
  /** Bill payment: biller id, the fetch reference and the biller's own params. */
  billerId?: string;
  referenceId?: string | null;
  params?: Record<string, string>;
  /** Customer mobile (10 digits) — required by bill payment, optional for recharge. */
  mobile?: string | null;
}

export class Pay2AllAdapter implements ProviderAdapter {
  readonly id = 'PAY2ALL';
  readonly mode: 'LIVE' | 'SIMULATOR' = 'LIVE';

  constructor(
    readonly client: Pay2AllClient,
    private readonly creds: Pay2AllCredentials,
  ) {}

  supports(service: ServiceCode) {
    if (this.client.isUat) return service === 'RECHARGE'; // Pay2All UAT covers recharge only
    return PAY2ALL_LIVE_SERVICES.includes(service);
  }

  async health() {
    try {
      const b = await this.client.read<{ organization?: string; balance?: number | string }>(
        'GET',
        '/balance',
        { timeoutMs: 8000 },
      );
      const bal = Number(b.balance ?? NaN);
      return {
        ok: true,
        detail: `Connected${b.organization ? ` · ${b.organization}` : ''}${
          Number.isFinite(bal) ? ` · wallet ₹${bal.toFixed(2)}` : ''
        }${this.client.isUat ? ' · UAT test mode' : ''}`,
        balancePaise: Number.isFinite(bal) ? Math.round(bal * 100) : null,
      };
    } catch (e) {
      return { ok: false, detail: (e as Error).message.slice(0, 160) };
    }
  }

  async execute(req: ExecuteRequest, timeoutMs: number): Promise<ExecuteResult> {
    const live = (req.live ?? {}) as Pay2AllLiveInput;
    let path: string;
    let body: Record<string, unknown>;
    if (req.serviceCode === 'RECHARGE') {
      if (!live.providerId)
        throw new AppError('VALIDATION_FAILED', 'Choose the operator', undefined, {
          'live.providerId': ['Choose the operator'],
        });
      path = '/recharge';
      body = {
        client_id: req.idempotencyKey,
        provider_id: live.providerId,
        number: String(req.details.subscriberNumber ?? ''),
        amount: rupees(req.amountPaise),
        ...(live.mobile ? { customer_mobile: live.mobile } : {}),
      };
    } else if (req.serviceCode === 'BILL_PAYMENT') {
      if (!live.billerId || !live.mobile)
        throw new AppError('VALIDATION_FAILED', 'Fetch the bill first', undefined, {
          'live.billerId': ['Choose the biller and fetch the bill'],
        });
      path = '/bbps/pay';
      body = {
        client_id: req.idempotencyKey,
        biller_id: live.billerId,
        reference_id: live.referenceId ?? undefined,
        params: live.params ?? {},
        amount: rupees(req.amountPaise),
        mobile: live.mobile,
      };
    } else {
      throw new AppError(
        'CONNECTOR_UNAVAILABLE',
        'This service is not available Live on Pay2All yet',
      );
    }

    let r: Pay2AllEnvelope<Record<string, unknown>>;
    try {
      r = await this.client.request<Record<string, unknown>>('POST', path, { body, timeoutMs });
    } catch (e) {
      // An HTTP 4xx means Pay2All refused the request: nothing was processed.
      if (e instanceof Pay2AllHttpError && e.status >= 400 && e.status < 500)
        return { status: 'FAILED', message: e.message };
      if (e instanceof Pay2AllHttpError)
        throw new OutcomeUnknownError(`Pay2All server error ${e.status}`);
      throw e;
    }
    const d = r.data ?? {};
    const status = statusOf(r.status_id) ?? statusOf(d.statusId) ?? statusOf(d.status_id) ?? null;
    if (!status) throw new OutcomeUnknownError('Pay2All response had no status');
    const ref = d.txn_id ?? d.id ?? d.orderId ?? d.order_id;
    return {
      status,
      providerRef: ref !== undefined && ref !== null ? String(ref) : undefined,
      operatorRef: (d.utr ?? undefined) as string | undefined,
      message: r.message ?? (typeof d.message === 'string' ? d.message : undefined),
    };
  }

  /**
   * Only bill payments have a documented status endpoint. For recharges we can't ask, so a pending
   * recharge stays PENDING until Pay2All's callback arrives — it is never assumed failed.
   */
  async queryStatus(idempotencyKey: string, service?: ServiceCode): Promise<StatusResult> {
    if (service !== 'BILL_PAYMENT') return { status: 'PENDING' };
    try {
      const r = await this.client.request<Record<string, unknown>>(
        'GET',
        `/bbps/transactions/${encodeURIComponent(idempotencyKey)}`,
        { timeoutMs: 8000 },
      );
      const d = r.data ?? {};
      const status = statusOf(d.statusId) ?? statusOf(d.status_id) ?? statusOf(r.status_id);
      const ref = d.id ?? d.orderId;
      return {
        status: status ?? 'PENDING',
        providerRef: ref !== undefined && ref !== null ? String(ref) : undefined,
      };
    } catch (e) {
      if (e instanceof Pay2AllHttpError && e.status === 404) return { status: 'NOT_FOUND' };
      throw e;
    }
  }

  async verifyAccount(req: AccountVerifyRequest, timeoutMs: number): Promise<AccountVerifyResult> {
    if (this.client.isUat)
      throw new AppError(
        'CONNECTOR_UNAVAILABLE',
        'Pay2All verifies accounts only in Live mode. Switch Pay2All to Live, or enter the name manually.',
      );
    let r: Pay2AllEnvelope<{ name?: string }>;
    try {
      r = await this.client.request<{ name?: string }>('POST', '/verify/bank_account', {
        body: {
          client_id: `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          provider_id: Number(this.creds.verifyProviderId ?? PAY2ALL_VERIFY_BANK_PROVIDER),
          number: req.accountNumber,
          ifsc: req.ifsc,
        },
        timeoutMs,
      });
    } catch (e) {
      if (e instanceof Pay2AllHttpError && e.status < 500)
        return { status: 'NOT_FOUND', message: e.message };
      throw e;
    }
    const name = r.data?.name?.trim();
    if (statusOf(r.status_id) === 'CONFIRMED' && name)
      return { status: 'VERIFIED', name: name.toUpperCase() };
    return { status: 'NOT_FOUND', message: r.message || 'Account not found' };
  }

  /** Pay2All callbacks carry no signature; see IntegrationsService.handlePay2AllCallback. */
  verifyWebhook(): WebhookVerification {
    return { valid: false, reason: 'Use the per-shop callback URL' };
  }
}

/** Parses a Pay2All callback body (fields per the reference: txn_id, client_id, status_id, utr, amount). */
export function parsePay2AllCallback(body: unknown): {
  clientId: string;
  status: ProviderResultStatus;
  providerRef?: string;
  utr?: string;
  amountPaise?: number;
} | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const clientId = typeof b.client_id === 'string' ? b.client_id : null;
  const status = statusOf(b.status_id);
  if (!clientId || !status) return null;
  const amount = Number(b.amount);
  return {
    clientId,
    status,
    providerRef: b.txn_id !== undefined && b.txn_id !== null ? String(b.txn_id) : undefined,
    utr: typeof b.utr === 'string' ? b.utr : undefined,
    amountPaise: Number.isFinite(amount) ? Math.round(amount * 100) : undefined,
  };
}
