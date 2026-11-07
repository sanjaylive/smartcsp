import { Injectable } from '@nestjs/common';
import { Db } from '../../common/db';
import { decryptSecret, encryptSecret } from '../../common/crypto';
import { AppError } from '../../common/errors';

export type OtpChannel = 'sms' | 'whatsapp';

/** Stored under the `sms21` platform setting. The API key is kept encrypted (SECRETS_ENCRYPTION_KEY). */
export interface Sms21Config {
  baseUrl: string;
  apiKeyEnc?: string;
  apiKeyMasked?: string;
  otpEnabled: boolean;
  otpChannel: OtpChannel;
  notifyEnabled: boolean;
  senderId?: string;
}

export const SMS21_DEFAULTS: Sms21Config = {
  baseUrl: 'https://api.sms21.in/v1',
  otpEnabled: false,
  otpChannel: 'whatsapp',
  notifyEnabled: false,
  senderId: '',
};

/** Public (safe) view of the config for the admin UI — never includes the key. */
export interface Sms21PublicConfig {
  configured: boolean;
  baseUrl: string;
  apiKeyMasked: string;
  otpEnabled: boolean;
  otpChannel: OtpChannel;
  notifyEnabled: boolean;
  senderId: string;
  testMode: boolean;
}

interface Sms21Ok {
  success?: boolean;
  [k: string]: unknown;
}

/** Client for the SMS21 messaging API (OTP, SMS, WhatsApp). Config lives in a platform setting. */
@Injectable()
export class Sms21Service {
  constructor(private readonly db: Db) {}
  private cache?: { cfg: Sms21Config; at: number };

  async config(): Promise<Sms21Config> {
    if (this.cache && Date.now() - this.cache.at < 15_000) return this.cache.cfg;
    const row = await this.db.asSystem((tx) =>
      tx.platformSetting.findUnique({ where: { key: 'sms21' } }),
    );
    const v = (row?.value ?? {}) as Partial<Sms21Config>;
    const cfg: Sms21Config = {
      baseUrl: v.baseUrl?.replace(/\/$/, '') || SMS21_DEFAULTS.baseUrl,
      apiKeyEnc: v.apiKeyEnc,
      apiKeyMasked: v.apiKeyMasked,
      otpEnabled: v.otpEnabled === true,
      otpChannel: v.otpChannel === 'sms' ? 'sms' : 'whatsapp',
      notifyEnabled: v.notifyEnabled === true,
      senderId: v.senderId ?? '',
    };
    this.cache = { cfg, at: Date.now() };
    return cfg;
  }

  /** Save config; a new apiKey (when provided) is encrypted and masked. Clears the cache. */
  async save(input: {
    apiKey?: string;
    baseUrl: string;
    otpEnabled: boolean;
    otpChannel: OtpChannel;
    notifyEnabled: boolean;
    senderId?: string;
  }): Promise<Sms21Config> {
    const prev = await this.config();
    const next: Sms21Config = {
      baseUrl: input.baseUrl.replace(/\/$/, '') || SMS21_DEFAULTS.baseUrl,
      apiKeyEnc: prev.apiKeyEnc,
      apiKeyMasked: prev.apiKeyMasked,
      otpEnabled: input.otpEnabled,
      otpChannel: input.otpChannel,
      notifyEnabled: input.notifyEnabled,
      senderId: input.senderId ?? '',
    };
    const key = input.apiKey?.trim();
    if (key) {
      next.apiKeyEnc = encryptSecret(key);
      next.apiKeyMasked = maskKey(key);
    }
    await this.db.asSystem((tx) =>
      tx.platformSetting.upsert({
        where: { key: 'sms21' },
        create: { key: 'sms21', value: next as unknown as object },
        update: { value: next as unknown as object },
      }),
    );
    this.cache = undefined;
    return next;
  }

  async publicConfig(): Promise<Sms21PublicConfig> {
    const c = await this.config();
    return {
      configured: !!c.apiKeyEnc,
      baseUrl: c.baseUrl,
      apiKeyMasked: c.apiKeyMasked ?? '',
      otpEnabled: c.otpEnabled,
      otpChannel: c.otpChannel,
      notifyEnabled: c.notifyEnabled,
      senderId: c.senderId ?? '',
      testMode: (c.apiKeyMasked ?? '').startsWith('sms21_test_'),
    };
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.config()).apiKeyEnc;
  }

  private async request<T extends Sms21Ok>(
    method: 'GET' | 'POST',
    path: string,
    opts: { body?: unknown; idempotencyKey?: string; timeoutMs?: number } = {},
  ): Promise<T> {
    const cfg = await this.config();
    if (!cfg.apiKeyEnc)
      throw new AppError('MESSAGING_NOT_CONFIGURED', 'SMS21 is not configured yet.');
    const key = decryptSecret(cfg.apiKeyEnc);
    const headers: Record<string, string> = { 'X-API-Key': key };
    if (opts.body) headers['Content-Type'] = 'application/json';
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}${path}`, {
        method,
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      });
    } catch (e) {
      throw new AppError('MESSAGING_FAILED', `Could not reach SMS21: ${(e as Error).message}`);
    }
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: { code?: string; message?: string };
    } & Record<string, unknown>;
    if (!res.ok || json.success === false) {
      throw new AppError('MESSAGING_FAILED', json.error?.message ?? `SMS21 error (${res.status})`, {
        providerStatus: res.status,
        providerCode: json.error?.code,
      });
    }
    return json as T;
  }

  keyInfo() {
    return this.request<{
      environment?: string;
      scopes?: string[];
      projectId?: string;
    }>('GET', '/api-keys/current');
  }

  wallet() {
    return this.request<{ balance?: number; currency?: string; [k: string]: unknown }>(
      'GET',
      '/wallet',
    );
  }

  sendSms(to: string, text: string, idempotencyKey?: string) {
    return this.config().then((c) =>
      this.request('POST', '/sms/send', {
        body: { to, text, ...(c.senderId ? { senderId: c.senderId } : {}) },
        idempotencyKey,
      }),
    );
  }

  sendWhatsapp(to: string, text: string, idempotencyKey?: string) {
    return this.request('POST', '/whatsapp/send', { body: { to, text }, idempotencyKey });
  }

  /** Channel-aware send used by notifications: WhatsApp when configured, else SMS. */
  async notify(to: string, text: string, idempotencyKey?: string) {
    const c = await this.config();
    return c.otpChannel === 'whatsapp'
      ? this.sendWhatsapp(to, text, idempotencyKey)
      : this.sendSms(to, text, idempotencyKey);
  }

  sendOtp(input: { mobile: string; purpose: string; ip?: string }) {
    return this.config().then((c) =>
      this.request<{ requestId: string; expiresIn: number; resendAfter: number; channel: string }>(
        'POST',
        '/otp/send',
        {
          body: {
            mobile: input.mobile,
            purpose: input.purpose,
            channel: c.otpChannel,
            fallbackChannel: c.otpChannel === 'whatsapp' ? 'sms' : undefined,
            ip: input.ip,
          },
        },
      ),
    );
  }

  verifyOtp(input: { requestId: string; otp: string; mobile: string }) {
    return this.request<{ verified: boolean; mobile?: string }>('POST', '/otp/verify', {
      body: input,
    });
  }
}

function maskKey(key: string): string {
  const tail = key.slice(-4);
  const prefix = key.startsWith('sms21_test_')
    ? 'sms21_test_'
    : key.startsWith('sms21_live_')
      ? 'sms21_live_'
      : 'sms21_';
  return `${prefix}…${tail}`;
}
