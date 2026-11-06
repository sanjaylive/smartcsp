import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import type { Permission, TenantRole } from '@csp2all/shared';

export type Tx = Prisma.TransactionClient;

/** Everything a tenant-scoped operation needs. Built only by the security guard after validation. */
export interface TenantCtx {
  tenantId: string;
  userId: string;
  membershipId: string | null;
  role: TenantRole | 'SUPPORT';
  permissions: ReadonlySet<Permission>;
  timezone: string;
  requestId?: string;
  ipHash?: string | null;
  actorType: 'USER' | 'SUPPORT' | 'SYSTEM';
  supportSessionId?: string | null;
}

const TX_OPTS = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class Db extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ log: [{ emit: 'event', level: 'warn' }] });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Runs `fn` in a transaction whose RLS context is the given tenant (and user).
   * All tenant-owned reads/writes MUST go through here; without context RLS returns no rows.
   */
  inTenant<T>(
    ctx: Pick<TenantCtx, 'tenantId' | 'userId'>,
    fn: (tx: Tx) => Promise<T>,
    opts?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T> {
    return this.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true), set_config('app.user_id', ${ctx.userId}, true)`;
        return fn(tx);
      },
      { ...TX_OPTS, ...opts },
    );
  }

  /** User-level context (no tenant): can see the user's own memberships and their tenants. */
  asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      return fn(tx);
    }, TX_OPTS);
  }

  /**
   * Platform/system context that bypasses RLS. Use only for super-admin operations, background
   * jobs that iterate tenants, and webhook routing — never for ordinary tenant requests.
   */
  asSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'on', true)`;
      return fn(tx);
    }, TX_OPTS);
  }
}

/** Atomically increments a per-tenant counter and returns the new value. */
export async function nextCounter(tx: Tx, tenantId: string, name: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: bigint }[]>`
    INSERT INTO tenant_counters ("tenantId", name, value) VALUES (${tenantId}::uuid, ${name}, 1)
    ON CONFLICT ("tenantId", name) DO UPDATE SET value = tenant_counters.value + 1
    RETURNING value`;
  return Number(rows[0].value);
}
