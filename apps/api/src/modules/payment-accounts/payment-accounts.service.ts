import { Injectable } from '@nestjs/common';
import { Prisma, type PaymentAccount } from '@prisma/client';
import type { z } from 'zod';
import type { paymentAccountCreateSchema, paymentAccountUpdateSchema } from '@csp2all/shared';
import { Db, type TenantCtx, type Tx } from '../../common/db';
import { AppError, notFound, versionConflict } from '../../common/errors';
import { AuditService } from '../../common/audit';

/** A shop may keep at most this many receiving accounts. */
const MAX_ACCOUNTS = 30;

export type PaymentAccountView = ReturnType<typeof view>;

export function view(a: PaymentAccount) {
  return {
    id: a.id,
    kind: a.kind as 'UPI' | 'BANK',
    label: a.label,
    upiId: a.upiId,
    upiApp: a.upiApp,
    payeeName: a.payeeName,
    holderName: a.holderName,
    bankName: a.bankName,
    accountNumber: a.accountNumber,
    ifsc: a.ifsc,
    accountType: a.accountType,
    qrAttachmentId: a.qrAttachmentId,
    isDefault: a.isDefault,
    active: a.active,
    sortOrder: a.sortOrder,
    version: a.version,
    updatedAt: a.updatedAt.toISOString(),
  };
}

function duplicate(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
    throw new AppError('CONFLICT', 'An account with this name already exists', undefined, {
      label: ['An account with this name already exists'],
    });
  throw e;
}

/**
 * The shop's own UPI IDs and bank accounts. Customers pay into these; a record remembers which one
 * so the owner can match it against the bank / UPI app statement.
 */
@Injectable()
export class PaymentAccountsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  list(ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => ({
      items: (
        await tx.paymentAccount.findMany({
          where: { tenantId: ctx.tenantId },
          orderBy: [
            { kind: 'desc' },
            { isDefault: 'desc' },
            { sortOrder: 'asc' },
            { label: 'asc' },
          ],
        })
      ).map(view),
    }));
  }

  /** Only one default per kind: the one pre-selected when collecting by UPI / bank. */
  private async clearDefault(tx: Tx, ctx: TenantCtx, kind: string, exceptId?: string) {
    await tx.paymentAccount.updateMany({
      where: {
        tenantId: ctx.tenantId,
        kind,
        isDefault: true,
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  create(ctx: TenantCtx, dto: z.infer<typeof paymentAccountCreateSchema>) {
    return this.db.inTenant(ctx, async (tx) => {
      const count = await tx.paymentAccount.count({ where: { tenantId: ctx.tenantId } });
      if (count >= MAX_ACCOUNTS)
        throw new AppError('QUOTA_EXCEEDED', `You can keep up to ${MAX_ACCOUNTS} payment accounts`);
      const sameKind = await tx.paymentAccount.count({
        where: { tenantId: ctx.tenantId, kind: dto.kind, active: true },
      });
      // The first account of a kind becomes the default automatically.
      const isDefault = dto.isDefault || sameKind === 0;
      if (isDefault) await this.clearDefault(tx, ctx, dto.kind);
      const a = await tx.paymentAccount
        .create({
          data: {
            tenantId: ctx.tenantId,
            kind: dto.kind,
            label: dto.label,
            isDefault,
            sortOrder: count,
            ...(dto.kind === 'UPI'
              ? { upiId: dto.upiId ?? null, payeeName: dto.payeeName ?? null, upiApp: dto.upiApp }
              : {
                  holderName: dto.holderName,
                  bankName: dto.bankName,
                  accountNumber: dto.accountNumber,
                  ifsc: dto.ifsc,
                  accountType: dto.accountType,
                }),
          },
        })
        .catch(duplicate);
      await this.audit.tenant(tx, ctx, {
        action: 'payment_account.created',
        targetType: 'payment_account',
        targetId: a.id,
        data: { kind: a.kind, label: a.label },
      });
      return view(a);
    });
  }

  update(ctx: TenantCtx, id: string, dto: z.infer<typeof paymentAccountUpdateSchema>) {
    return this.db.inTenant(ctx, async (tx) => {
      const a = await tx.paymentAccount.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!a) throw notFound('Payment account');
      const isUpi = a.kind === 'UPI';
      if (dto.isDefault) await this.clearDefault(tx, ctx, a.kind, id);
      const res = await tx.paymentAccount
        .updateMany({
          where: { id, tenantId: ctx.tenantId, version: dto.version },
          data: {
            label: dto.label,
            isDefault: dto.active === false ? false : dto.isDefault,
            active: dto.active,
            ...(isUpi
              ? { upiId: dto.upiId, payeeName: dto.payeeName, upiApp: dto.upiApp }
              : {
                  holderName: dto.holderName,
                  bankName: dto.bankName,
                  accountNumber: dto.accountNumber,
                  ifsc: dto.ifsc,
                  accountType: dto.accountType,
                }),
            version: { increment: 1 },
          },
        })
        .catch(duplicate);
      if (res.count !== 1) throw versionConflict();
      await this.audit.tenant(tx, ctx, {
        action: 'payment_account.updated',
        targetType: 'payment_account',
        targetId: id,
        data: { fields: Object.keys(dto).filter((k) => k !== 'version') },
      });
      return view(await tx.paymentAccount.findUniqueOrThrow({ where: { id } }));
    });
  }

  /** Accounts already used on records are only switched off, so history keeps its link. */
  remove(ctx: TenantCtx, id: string) {
    return this.db.inTenant(ctx, async (tx) => {
      const a = await tx.paymentAccount.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!a) throw notFound('Payment account');
      const used = await tx.serviceRecord.count({
        where: { tenantId: ctx.tenantId, paymentAccountId: id },
      });
      if (used) {
        await tx.paymentAccount.update({
          where: { id },
          data: { active: false, isDefault: false, version: { increment: 1 } },
        });
      } else {
        if (a.qrAttachmentId)
          await tx.attachment.updateMany({
            where: { id: a.qrAttachmentId, tenantId: ctx.tenantId },
            data: { deletedAt: new Date() },
          });
        await tx.paymentAccount.delete({ where: { id } });
      }
      await this.audit.tenant(tx, ctx, {
        action: used ? 'payment_account.deactivated' : 'payment_account.deleted',
        targetType: 'payment_account',
        targetId: id,
        data: { label: a.label },
      });
      return { ok: true, deleted: !used };
    });
  }

  /**
   * Checks the account a record says the customer paid into: it must be this shop's, active, and
   * of the matching kind (UPI for UPI, bank account for bank transfer).
   */
  async resolveForRecord(
    tx: Tx,
    ctx: TenantCtx,
    accountId: string | null | undefined,
    method: string,
  ): Promise<string | null> {
    if (!accountId) return null;
    const fail = (msg: string) =>
      new AppError('VALIDATION_FAILED', msg, undefined, { paymentAccountId: [msg] });
    if (method !== 'UPI' && method !== 'BANK')
      throw fail('A receiving account applies only to UPI or bank payments');
    const a = await tx.paymentAccount.findFirst({
      where: { id: accountId, tenantId: ctx.tenantId, active: true },
    });
    if (!a) throw fail('Choose one of the shop’s payment accounts');
    if (a.kind !== method)
      throw fail(
        method === 'UPI' ? 'Choose a UPI account for a UPI payment' : 'Choose a bank account',
      );
    return a.id;
  }
}
