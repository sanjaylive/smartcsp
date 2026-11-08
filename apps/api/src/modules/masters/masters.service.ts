import { Injectable } from '@nestjs/common';
import { Prisma, type ShopMaster } from '@prisma/client';
import type { z } from 'zod';
import {
  EXPENSE_CATEGORIES,
  masterDataSchemas,
  type masterCreateSchema,
  type masterUpdateSchema,
  type MasterKind,
} from '@csp2all/shared';
import { Db, type TenantCtx, type Tx } from '../../common/db';
import { AppError, notFound, versionConflict, zodToAppError } from '../../common/errors';
import { AuditService } from '../../common/audit';
import { fundAccountFor } from '../ledger/ledger.service';

/** A shop may keep at most this many entries per list. */
const MAX_PER_KIND = 100;

export type MasterView = ReturnType<typeof view>;

function view(m: ShopMaster) {
  return {
    id: m.id,
    kind: m.kind as MasterKind,
    name: m.name,
    data: m.data as Record<string, unknown>,
    active: m.active,
    sortOrder: m.sortOrder,
    version: m.version,
    updatedAt: m.updatedAt.toISOString(),
  };
}

function duplicate(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
    throw new AppError('CONFLICT', 'An entry with this name already exists', undefined, {
      name: ['An entry with this name already exists'],
    });
  throw e;
}

@Injectable()
export class MastersService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  list(ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => {
      const rows = await tx.shopMaster.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      });
      return { items: rows.map(view) };
    });
  }

  create(ctx: TenantCtx, dto: z.infer<typeof masterCreateSchema>) {
    return this.db.inTenant(ctx, async (tx) => {
      const count = await tx.shopMaster.count({
        where: { tenantId: ctx.tenantId, kind: dto.kind },
      });
      if (count >= MAX_PER_KIND)
        throw new AppError(
          'QUOTA_EXCEEDED',
          `You can keep up to ${MAX_PER_KIND} entries in this list`,
        );
      if (dto.kind === 'EXPENSE_CATEGORY' && this.isBuiltInCategory(dto.name))
        throw new AppError('CONFLICT', 'That is already a built-in category', undefined, {
          name: ['That is already a built-in category'],
        });
      const m = await tx.shopMaster
        .create({
          data: {
            tenantId: ctx.tenantId,
            kind: dto.kind,
            name: dto.name,
            data: dto.data as Prisma.InputJsonValue,
            sortOrder: count,
          },
        })
        .catch(duplicate);
      await this.audit.tenant(tx, ctx, {
        action: 'master.created',
        targetType: 'master',
        targetId: m.id,
        data: { kind: m.kind, name: m.name },
      });
      return view(m);
    });
  }

  update(ctx: TenantCtx, id: string, dto: z.infer<typeof masterUpdateSchema>) {
    return this.db.inTenant(ctx, async (tx) => {
      const m = await tx.shopMaster.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!m) throw notFound('Entry');
      let data: Prisma.InputJsonValue | undefined;
      if (dto.data !== undefined) {
        const r = masterDataSchemas[m.kind as MasterKind].safeParse(dto.data);
        if (!r.success) {
          const e = zodToAppError(r.error);
          throw new AppError(
            e.code,
            e.message,
            undefined,
            Object.fromEntries(Object.entries(e.fields ?? {}).map(([k, v]) => [`data.${k}`, v])),
          );
        }
        data = r.data as Prisma.InputJsonValue;
      }
      if (dto.name && m.kind === 'EXPENSE_CATEGORY' && this.isBuiltInCategory(dto.name))
        throw new AppError('CONFLICT', 'That is already a built-in category');
      const res = await tx.shopMaster
        .updateMany({
          where: { id, tenantId: ctx.tenantId, version: dto.version },
          data: {
            name: dto.name,
            active: dto.active,
            sortOrder: dto.sortOrder,
            data,
            version: { increment: 1 },
          },
        })
        .catch(duplicate);
      if (res.count !== 1) throw versionConflict();
      await this.audit.tenant(tx, ctx, {
        action: 'master.updated',
        targetType: 'master',
        targetId: id,
        data: { kind: m.kind, fields: Object.keys(dto).filter((k) => k !== 'version') },
      });
      return view(await tx.shopMaster.findUniqueOrThrow({ where: { id } }));
    });
  }

  // --------------------------------------------------------------------------- validation helpers

  private isBuiltInCategory(name: string) {
    const up = name.trim().toUpperCase().replace(/\s+/g, '_');
    return (EXPENSE_CATEGORIES as readonly string[]).includes(up);
  }

  private async findActive(tx: Tx, ctx: TenantCtx, kind: MasterKind, name: string) {
    return tx.shopMaster.findFirst({
      where: { tenantId: ctx.tenantId, kind, name, active: true },
    });
  }

  /** Category must be a built-in code or an active shop-defined category. */
  async assertExpenseCategory(tx: Tx, ctx: TenantCtx, category: string) {
    if ((EXPENSE_CATEGORIES as readonly string[]).includes(category)) return;
    if (!(await this.findActive(tx, ctx, 'EXPENSE_CATEGORY', category)))
      throw new AppError('VALIDATION_FAILED', 'Choose a category from the list', undefined, {
        category: ['Choose a category from the list'],
      });
  }

  /**
   * A shop-defined payment mode is only a label: the money still lands in the fund account of
   * `method`. Reject a mode whose configured account differs, so the cashbook stays correct.
   */
  async resolvePaymentMode(
    tx: Tx,
    ctx: TenantCtx,
    mode: string | null | undefined,
    method: string,
    field = 'paymentMode',
  ): Promise<string | null> {
    if (!mode) return null;
    const m = await this.findActive(tx, ctx, 'PAYMENT_MODE', mode);
    const fail = (msg: string) =>
      new AppError('VALIDATION_FAILED', msg, undefined, { [field]: [msg] });
    if (!m) throw fail('Choose a payment mode from the list');
    if (method === 'NONE') throw fail('A payment mode needs an amount received');
    const account = (m.data as { account?: string }).account;
    if (account !== fundAccountFor(method))
      throw fail(
        `${m.name} is set up to go to ${account?.toLowerCase()} — pick the matching method`,
      );
    return m.name;
  }

  async resolveProvider(tx: Tx, ctx: TenantCtx, provider: string | null | undefined) {
    if (!provider) return null;
    const m = await this.findActive(tx, ctx, 'PROVIDER', provider);
    if (!m)
      throw new AppError('VALIDATION_FAILED', 'Choose a provider from the list', undefined, {
        provider: ['Choose a provider from the list'],
      });
    return m.name;
  }
}
