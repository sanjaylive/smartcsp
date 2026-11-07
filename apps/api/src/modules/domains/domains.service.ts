import { Injectable } from '@nestjs/common';
import { promises as dns } from 'node:dns';
import { randomBytes } from 'node:crypto';
import { Db, type TenantCtx } from '../../common/db';
import { AppError, notFound } from '../../common/errors';

const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const VERIFY_SUBNAME = '_smart-outlet-verify';
// The apex the shop should point their domain at (A record) — overridable per deployment.
const TARGET_IP = process.env.CUSTOM_DOMAIN_TARGET_IP ?? '148.66.152.2';
const RESERVED = new Set(['smart-outlet.in', 'www.smart-outlet.in']);

export function normalizeDomain(raw: string): string {
  const d = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
  if (!HOST_RE.test(d) || d.includes('*') || RESERVED.has(d) || d.endsWith('.smart-outlet.in'))
    throw new AppError('VALIDATION_FAILED', 'Enter a valid domain you own.', undefined, {
      domain: ['Enter a valid domain, e.g. shop.example.com'],
    });
  return d;
}

export interface DomainView {
  id: string;
  domain: string;
  status: string;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  dns: { txt: { name: string; value: string }; a: { name: string; value: string } };
}

@Injectable()
export class DomainsService {
  constructor(private readonly db: Db) {}

  private view(d: {
    id: string;
    domain: string;
    status: string;
    verificationToken: string;
    verifiedAt: Date | null;
    lastCheckedAt: Date | null;
  }): DomainView {
    return {
      id: d.id,
      domain: d.domain,
      status: d.status,
      verifiedAt: d.verifiedAt?.toISOString() ?? null,
      lastCheckedAt: d.lastCheckedAt?.toISOString() ?? null,
      dns: {
        txt: { name: `${VERIFY_SUBNAME}.${d.domain}`, value: d.verificationToken },
        a: { name: d.domain, value: TARGET_IP },
      },
    };
  }

  async list(ctx: TenantCtx): Promise<DomainView[]> {
    const rows = await this.db.inTenant(ctx, (tx) =>
      tx.customDomain.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return rows.map((r) => this.view(r));
  }

  async add(ctx: TenantCtx, rawDomain: string): Promise<DomainView> {
    const domain = normalizeDomain(rawDomain);
    const taken = await this.db.asSystem((tx) => tx.customDomain.findUnique({ where: { domain } }));
    if (taken)
      throw new AppError('CONFLICT', 'That domain is already in use.', undefined, {
        domain: ['This domain is already connected'],
      });
    const row = await this.db.inTenant(ctx, (tx) =>
      tx.customDomain.create({
        data: {
          tenantId: ctx.tenantId,
          domain,
          verificationToken: `so-verify-${randomBytes(16).toString('hex')}`,
        },
      }),
    );
    return this.view(row);
  }

  async verify(ctx: TenantCtx, id: string): Promise<DomainView> {
    const row = await this.db.inTenant(ctx, (tx) =>
      tx.customDomain.findFirst({ where: { id, tenantId: ctx.tenantId } }),
    );
    if (!row) throw notFound('Domain');
    let ok = false;
    try {
      const records = await dns.resolveTxt(`${VERIFY_SUBNAME}.${row.domain}`);
      ok = records.some((chunks) => chunks.join('').trim() === row.verificationToken);
    } catch {
      ok = false;
    }
    const updated = await this.db.inTenant(ctx, (tx) =>
      tx.customDomain.update({
        where: { id: row.id },
        data: {
          status: ok ? 'VERIFIED' : 'FAILED',
          verifiedAt: ok ? new Date() : null,
          lastCheckedAt: new Date(),
        },
      }),
    );
    if (!ok)
      throw new AppError(
        'VALIDATION_FAILED',
        'We could not find the verification TXT record yet. DNS can take a few minutes.',
      );
    return this.view(updated);
  }

  async remove(ctx: TenantCtx, id: string): Promise<void> {
    const r = await this.db.inTenant(ctx, (tx) =>
      tx.customDomain.deleteMany({ where: { id, tenantId: ctx.tenantId } }),
    );
    if (r.count === 0) throw notFound('Domain');
  }

  /** Public: is this host a verified custom domain? Used by Caddy on-demand TLS and host routing. */
  async resolveVerified(
    domain: string,
  ): Promise<{ tenantId: string; name: string; brandColor: string | null } | null> {
    const d = domain.trim().toLowerCase();
    if (!HOST_RE.test(d)) return null;
    const row = await this.db.asSystem((tx) =>
      tx.customDomain.findFirst({
        where: { domain: d, status: 'VERIFIED' },
        select: { tenantId: true, tenant: { select: { name: true, brandColor: true } } },
      }),
    );
    if (!row) return null;
    return { tenantId: row.tenantId, name: row.tenant.name, brandColor: row.tenant.brandColor };
  }
}
