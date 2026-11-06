import { createHmac, timingSafeEqual } from 'node:crypto';
import type IORedis from 'ioredis';
import type { ServiceCode } from '@csp2all/shared';
import { AppError } from '../../common/errors';

export type ProviderResultStatus = 'CONFIRMED' | 'FAILED' | 'PENDING';

export interface ExecuteRequest {
  idempotencyKey: string;
  serviceCode: ServiceCode;
  operationType: string;
  amountPaise: number;
  /** Already-validated, minimal record details. Never contains biometrics, PINs or card data. */
  details: Record<string, unknown>;
}

export interface ExecuteResult {
  status: ProviderResultStatus;
  providerRef?: string;
  message?: string;
}

export interface StatusResult {
  status: ProviderResultStatus | 'NOT_FOUND';
  providerRef?: string;
}

export interface WebhookVerification {
  valid: boolean;
  deliveryId?: string;
  event?: { providerRef?: string; idempotencyKey?: string; status: ProviderResultStatus };
  reason?: string;
}

/** Raised when a call's outcome cannot be known (timeout, connection reset after send, 5xx). */
export class OutcomeUnknownError extends Error {}

/**
 * Provider boundary. Implementations must:
 *  - authenticate exactly as the provider documents (no invented signing schemes),
 *  - pass idempotency keys where the provider supports them,
 *  - throw OutcomeUnknownError when a money-moving request may have been received,
 *  - verify webhook signatures on the raw body before any parsing.
 */
export interface ProviderAdapter {
  readonly id: string;
  readonly mode: 'SIMULATOR' | 'LIVE';
  supports(service: ServiceCode): boolean;
  health(): Promise<{ ok: boolean; detail: string }>;
  execute(req: ExecuteRequest, timeoutMs: number): Promise<ExecuteResult>;
  queryStatus(idempotencyKey: string): Promise<StatusResult>;
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookVerification;
}

export const PAY2ALL_MISSING = [
  'Official Pay2All API documentation (base URLs, endpoints, request/response schemas)',
  'Authentication and request-signing specification',
  'Supported services and per-service operation semantics',
  'Idempotency / duplicate-request behaviour and status-query endpoint',
  'Webhook delivery, signature and retry specification',
  'Sandbox credentials and test cases',
  'Production credentials, IP allow-listing and any required approvals',
];

/**
 * Pay2All adapter — intentionally DISABLED. No official documentation or credentials were supplied,
 * so no endpoints, payloads or signing rules are implemented. See docs/PAY2ALL_READINESS.md.
 */
export class Pay2AllAdapter implements ProviderAdapter {
  readonly id = 'PAY2ALL';
  readonly mode = 'LIVE' as const;
  private unavailable(): never {
    throw new AppError(
      'CONNECTOR_UNAVAILABLE',
      'The Pay2All connector is not available: official documentation and credentials have not been provided.',
      { missing: PAY2ALL_MISSING },
    );
  }
  supports(): boolean {
    return false;
  }
  async health() {
    return {
      ok: false,
      detail: 'Disabled: awaiting official Pay2All documentation and credentials',
    };
  }
  async execute(): Promise<ExecuteResult> {
    this.unavailable();
  }
  async queryStatus(): Promise<StatusResult> {
    this.unavailable();
  }
  verifyWebhook(): WebhookVerification {
    return { valid: false, reason: 'Pay2All webhooks are not enabled' };
  }
}

/**
 * SIMULATOR — for development and tests only. It never contacts any real provider and never moves
 * money. Deterministic outcomes by the last two digits of the amount in paise:
 *   ..13 → provider accepts but the response times out (outcome UNKNOWN; reconciliation finds CONFIRMED)
 *   ..99 → FAILED      ..55 → PENDING (settles to CONFIRMED on status query / webhook)
 *   anything else → CONFIRMED
 */
export class SimulatorAdapter implements ProviderAdapter {
  readonly id = 'SIMULATOR';
  readonly mode = 'SIMULATOR' as const;
  constructor(
    private readonly webhookSecret: string,
    private readonly redis: IORedis,
  ) {}

  private key(k: string) {
    return `csp2all:simulator:${k}`;
  }
  private async load(k: string) {
    const raw = await this.redis.get(this.key(k));
    return raw
      ? (JSON.parse(raw) as { status: ProviderResultStatus; providerRef: string; polls: number })
      : null;
  }
  private async save(
    k: string,
    v: { status: ProviderResultStatus; providerRef: string; polls: number },
  ) {
    await this.redis.set(this.key(k), JSON.stringify(v), 'EX', 7 * 86400);
  }

  supports(service: ServiceCode) {
    return ['RECHARGE', 'BILL_PAYMENT', 'DMT', 'AEPS', 'MICRO_ATM', 'PAN'].includes(service);
  }

  async health() {
    return { ok: true, detail: 'Simulator ready (no real transactions)' };
  }

  async execute(req: ExecuteRequest, timeoutMs: number): Promise<ExecuteResult> {
    const existing = await this.load(req.idempotencyKey);
    if (existing)
      return {
        status: existing.status,
        providerRef: existing.providerRef,
        message: 'Duplicate request: original result returned',
      };
    const tail = req.amountPaise % 100;
    const providerRef = `SIM${Date.now().toString(36).toUpperCase()}${Math.floor(
      Math.random() * 1e6,
    )
      .toString(36)
      .toUpperCase()}`;
    if (tail === 13) {
      await this.save(req.idempotencyKey, { status: 'CONFIRMED', providerRef, polls: 0 });
      await new Promise((r) => setTimeout(r, Math.min(timeoutMs, 50)));
      throw new OutcomeUnknownError('Simulated timeout after provider accepted the request');
    }
    const status: ProviderResultStatus =
      tail === 99 ? 'FAILED' : tail === 55 ? 'PENDING' : 'CONFIRMED';
    await this.save(req.idempotencyKey, { status, providerRef, polls: 0 });
    return { status, providerRef, message: `Simulated ${status.toLowerCase()}` };
  }

  async queryStatus(idempotencyKey: string): Promise<StatusResult> {
    const s = await this.load(idempotencyKey);
    if (!s) return { status: 'NOT_FOUND' };
    if (s.status === 'PENDING') {
      s.status = 'CONFIRMED';
      await this.save(idempotencyKey, s);
    }
    return { status: s.status, providerRef: s.providerRef };
  }

  /** Simulator webhook signature: header `x-sim-signature: t=<unix>,v1=<hex hmac(secret, t + "." + rawBody)>`. */
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookVerification {
    const header = headers['x-sim-signature'];
    if (typeof header !== 'string') return { valid: false, reason: 'missing signature' };
    const parts = Object.fromEntries(
      header.split(',').map((p) => p.split('=') as [string, string]),
    );
    const t = Number(parts.t);
    if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300)
      return { valid: false, reason: 'timestamp outside tolerance' };
    const expected = createHmac('sha256', this.webhookSecret)
      .update(`${t}.`)
      .update(rawBody)
      .digest();
    const given = Buffer.from(parts.v1 ?? '', 'hex');
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      return { valid: false, reason: 'bad signature' };
    const body = JSON.parse(rawBody.toString('utf8')) as {
      deliveryId?: string;
      providerRef?: string;
      idempotencyKey?: string;
      status?: string;
    };
    if (!body.deliveryId || !['CONFIRMED', 'FAILED', 'PENDING'].includes(body.status ?? ''))
      return { valid: false, reason: 'malformed event' };
    return {
      valid: true,
      deliveryId: body.deliveryId,
      event: {
        providerRef: body.providerRef,
        idempotencyKey: body.idempotencyKey,
        status: body.status as ProviderResultStatus,
      },
    };
  }

  static sign(secret: string, rawBody: string, t = Math.floor(Date.now() / 1000)) {
    return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')}`;
  }
}

/** Simple consecutive-failure circuit breaker per provider. */
export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;
  constructor(
    private readonly threshold = 5,
    private readonly coolDownMs = 30_000,
  ) {}
  assertClosed() {
    if (Date.now() < this.openUntil)
      throw new AppError(
        'CONNECTOR_UNAVAILABLE',
        'The provider is temporarily unavailable. Nothing was sent. Try again shortly.',
      );
  }
  success() {
    this.failures = 0;
  }
  failure() {
    if (++this.failures >= this.threshold) {
      this.openUntil = Date.now() + this.coolDownMs;
      this.failures = 0;
    }
  }
}
