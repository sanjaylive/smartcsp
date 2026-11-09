import { Injectable } from '@nestjs/common';
import type { Prisma, ServiceRecord } from '@prisma/client';
import {
  allowedTransitions,
  buildDetailsSchema,
  canTransition,
  customFieldsSchema,
  customFieldsToFieldDefs,
  initialStatuses,
  isPostableStatus,
  localDate,
  maskIdentifier,
  recordCreateSchema,
  recordListQuery,
  recordUpdateSchema,
  SERVICE_REGISTRY,
  transitionNeedsReason,
  type FieldDef,
  type OpStatus,
  type PrincipalDirection,
  type ServiceCode,
  type WorkflowType,
} from '@csp2all/shared';
import type { z } from 'zod';
import { Db, nextCounter, type TenantCtx, type Tx } from '../../common/db';
import { AppError, notFound, versionConflict, zodToAppError } from '../../common/errors';
import { PaymentAccountsService } from '../payment-accounts/payment-accounts.service';
import { MastersService } from '../masters/masters.service';
import { buildReceipt } from './receipt';
import { AuditService } from '../../common/audit';
import { requirePerm } from '../../common/access';
import { big, d, n, pageResult, paginate, toDate } from '../../common/serialize';
import { LedgerService } from '../ledger/ledger.service';
import { EntitlementsService } from '../subscription/entitlements.service';
import { ServiceAvailabilityService } from '../services/service-availability.service';
import {
  cashEffect,
  paymentStatusFor,
  receivableFor,
  recordPostingLines,
  validateAmounts,
  type RecordAmounts,
} from './posting';

type CreateDto = z.infer<typeof recordCreateSchema>;
type UpdateDto = z.infer<typeof recordUpdateSchema>;

const FINANCIAL_FIELDS = [
  'principalPaise',
  'customerFeePaise',
  'expectedCommissionPaise',
  'paymentMethod',
  'amountCollectedPaise',
  'principalMethod',
  'txnDate',
] as const;

/** Records a user may see: everything with records.view_all, otherwise own/assigned records. */
export function visibleWhere(ctx: TenantCtx): Prisma.ServiceRecordWhereInput {
  const base: Prisma.ServiceRecordWhereInput = { tenantId: ctx.tenantId };
  if (ctx.permissions.has('records.view_all')) return base;
  return { ...base, OR: [{ createdByUserId: ctx.userId }, { assignedToUserId: ctx.userId }] };
}

interface ResolvedService {
  code: ServiceCode;
  workflowType: WorkflowType;
  fields: FieldDef[];
  direction: (details: Record<string, unknown>) => PrincipalDirection;
  customServiceId: string | null;
}

@Injectable()
export class RecordsService {
  constructor(
    private readonly db: Db,
    private readonly ledger: LedgerService,
    private readonly entitlements: EntitlementsService,
    private readonly availability: ServiceAvailabilityService,
    private readonly audit: AuditService,
    private readonly masters: MastersService,
    private readonly paymentAccounts: PaymentAccountsService,
  ) {}

  private async resolveService(
    tx: Tx,
    ctx: TenantCtx,
    code: ServiceCode,
    customServiceId?: string | null,
  ): Promise<ResolvedService> {
    if (code === 'CUSTOM') {
      if (!customServiceId)
        throw new AppError('VALIDATION_FAILED', 'Choose a custom service', undefined, {
          customServiceId: ['Required'],
        });
      const def = await tx.customServiceDefinition.findFirst({
        where: { id: customServiceId, tenantId: ctx.tenantId },
      });
      if (!def) throw notFound('Custom service');
      if (!def.active)
        throw new AppError('SERVICE_NOT_AVAILABLE', 'This custom service is inactive');
      const fields = customFieldsToFieldDefs(customFieldsSchema.parse(def.fields));
      return {
        code,
        workflowType: def.workflowType as WorkflowType,
        fields,
        direction: () => def.principalDirection as PrincipalDirection,
        customServiceId: def.id,
      };
    }
    const reg = SERVICE_REGISTRY[code];
    return {
      code,
      workflowType: reg.workflowType,
      fields: reg.fields,
      direction: reg.principalDirection,
      customServiceId: null,
    };
  }

  private validateDetails(svc: ResolvedService, details: Record<string, unknown>) {
    const r = buildDetailsSchema(svc.fields).safeParse(details);
    if (!r.success) {
      const err = zodToAppError(r.error);
      const fields = Object.fromEntries(
        Object.entries(err.fields ?? {}).map(([k, v]) => [`details.${k}`, v]),
      );
      throw new AppError(err.code, err.message, undefined, fields);
    }
    return r.data as Record<string, unknown>;
  }

  private async assertCustomer(tx: Tx, ctx: TenantCtx, customerId: string | null | undefined) {
    if (!customerId) return;
    const c = await tx.customer.findFirst({
      where: { id: customerId, tenantId: ctx.tenantId },
      select: { id: true, archivedAt: true },
    });
    if (!c)
      throw new AppError('VALIDATION_FAILED', 'Customer not found in this shop', undefined, {
        customerId: ['Not found'],
      });
    if (c.archivedAt)
      throw new AppError('VALIDATION_FAILED', 'Customer is archived', undefined, {
        customerId: ['Archived'],
      });
  }

  private async assertAssignee(tx: Tx, ctx: TenantCtx, userId: string | null | undefined) {
    if (!userId) return;
    const m = await tx.membership.findFirst({
      where: { tenantId: ctx.tenantId, userId, status: 'ACTIVE' },
    });
    if (!m)
      throw new AppError(
        'VALIDATION_FAILED',
        'Assignee is not active staff in this shop',
        undefined,
        { assignedToUserId: ['Not a member'] },
      );
  }

  private amountsOf(
    r: Pick<
      ServiceRecord,
      | 'principalDirection'
      | 'principalPaise'
      | 'customerFeePaise'
      | 'expectedCommissionPaise'
      | 'amountCollectedPaise'
      | 'paymentMethod'
      | 'principalMethod'
    >,
  ): RecordAmounts {
    return {
      direction: r.principalDirection as PrincipalDirection,
      principal: r.principalPaise,
      fee: r.customerFeePaise,
      expectedCommission: r.expectedCommissionPaise,
      collected: r.amountCollectedPaise,
      paymentMethod: r.paymentMethod,
      principalMethod: r.principalMethod,
    };
  }

  /** Read-only preview of the cashbook effect, shown before saving. */
  async preview(ctx: TenantCtx, dto: CreateDto) {
    return this.db.inTenant(ctx, async (tx) => {
      const svc = await this.resolveService(tx, ctx, dto.serviceCode, dto.customServiceId);
      const details = this.validateDetails(svc, dto.details);
      const a: RecordAmounts = {
        direction: svc.direction(details),
        principal: big(dto.principalPaise),
        fee: big(dto.customerFeePaise),
        expectedCommission: big(dto.expectedCommissionPaise),
        collected: big(dto.amountCollectedPaise),
        paymentMethod: dto.paymentMethod,
        principalMethod: dto.principalMethod,
      };
      const { receivable, due } = validateAmounts(a);
      const lines = recordPostingLines(a);
      return {
        direction: a.direction,
        receivablePaise: n(receivable),
        amountDuePaise: n(due),
        cashEffectPaise: n(cashEffect(a)),
        lines: lines.map((l) => ({
          account: l.account,
          debitPaise: n(l.debit ?? 0n),
          creditPaise: n(l.credit ?? 0n),
          memo: l.memo,
        })),
      };
    });
  }

  async create(
    ctx: TenantCtx,
    dto: CreateDto,
    source: 'MANUAL' | 'MOBILE_SYNC' | 'PROVIDER' = 'MANUAL',
    txIn?: Tx,
  ) {
    const run = async (tx: Tx) => {
      if (dto.clientRef) {
        const existing = await tx.serviceRecord.findUnique({
          where: { tenantId_clientRef: { tenantId: ctx.tenantId, clientRef: dto.clientRef } },
        });
        if (existing) return { record: existing, duplicate: true };
      }
      const svc = await this.resolveService(tx, ctx, dto.serviceCode, dto.customServiceId);
      await this.availability.assertCanCreate(tx, ctx, dto.serviceCode);
      const details = this.validateDetails(svc, dto.details);
      if (!initialStatuses(svc.workflowType).includes(dto.opStatus)) {
        throw new AppError(
          'INVALID_TRANSITION',
          `Status ${dto.opStatus} is not valid for this service`,
          { allowed: initialStatuses(svc.workflowType) },
        );
      }
      if (dto.post && !isPostableStatus(svc.workflowType, dto.opStatus)) {
        throw new AppError(
          'INVALID_TRANSITION',
          'Only active or completed records can be posted to the cashbook',
        );
      }
      if (dto.post) requirePerm(ctx, 'records.post');
      await this.assertCustomer(tx, ctx, dto.customerId);
      await this.assertAssignee(tx, ctx, dto.assignedToUserId);

      const direction = svc.direction(details);
      const amounts: RecordAmounts = {
        direction,
        principal: big(dto.principalPaise),
        fee: big(dto.customerFeePaise),
        expectedCommission: big(dto.expectedCommissionPaise),
        collected: big(dto.amountCollectedPaise),
        paymentMethod: dto.paymentMethod,
        principalMethod: dto.principalMethod,
      };
      const { receivable, due } = validateAmounts(amounts);
      const paymentMode = await this.masters.resolvePaymentMode(
        tx,
        ctx,
        dto.paymentMode,
        dto.paymentMethod,
      );
      const provider = await this.masters.resolveProvider(tx, ctx, dto.provider);
      const paymentAccountId = await this.paymentAccounts.resolveForRecord(
        tx,
        ctx,
        dto.paymentAccountId,
        dto.paymentMethod,
      );

      await this.entitlements.consumeRecordQuota(tx, ctx.tenantId, ctx.timezone);
      const branch = await tx.branch.findFirstOrThrow({
        where: { tenantId: ctx.tenantId, isPrimary: true },
      });
      const recordNo = await nextCounter(tx, ctx.tenantId, 'record');
      let record = await tx.serviceRecord.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: branch.id,
          recordNo,
          serviceCode: svc.code,
          customServiceId: svc.customServiceId,
          workflowType: svc.workflowType,
          principalDirection: direction,
          customerId: dto.customerId ?? null,
          walkInName: dto.customerId ? null : (dto.walkInName ?? null),
          txnDate: toDate(dto.txnDate),
          principalPaise: amounts.principal,
          customerFeePaise: amounts.fee,
          expectedCommissionPaise: amounts.expectedCommission,
          paymentMethod: dto.paymentMethod,
          principalMethod: dto.principalMethod,
          paymentMode,
          paymentAccountId,
          provider,
          amountCollectedPaise: amounts.collected,
          amountDuePaise: due,
          paymentStatus: paymentStatusFor(receivable, amounts.collected),
          externalRef: dto.externalRef ?? null,
          assignedToUserId: dto.assignedToUserId ?? null,
          notes: dto.notes ?? null,
          followUpDate: dto.followUpDate ? toDate(dto.followUpDate) : null,
          details: details as Prisma.InputJsonValue,
          source,
          opStatus: dto.opStatus,
          postingStatus: recordPostingLines(amounts).length === 0 ? 'NOT_REQUIRED' : 'UNPOSTED',
          clientRef: dto.clientRef ?? null,
          createdByUserId: ctx.userId,
          connectorStatus: source === 'PROVIDER' ? 'INITIATED' : 'NONE',
        },
      });
      await this.event(tx, ctx, record.id, 'OPERATIONAL', null, dto.opStatus, null, { source });
      if (svc.code === 'DMT' && record.customerId) {
        // Keep the customer's most-used beneficiaries at the top of the list.
        await tx.beneficiary.updateMany({
          where: {
            tenantId: ctx.tenantId,
            customerId: record.customerId,
            accountNumber: String(details.accountNumber ?? ''),
            bankName: String(details.bankName ?? ''),
          },
          data: { lastUsedAt: new Date() },
        });
      }
      if (dto.followUpDate) {
        await tx.followUpTask.create({
          data: {
            tenantId: ctx.tenantId,
            recordId: record.id,
            customerId: dto.customerId ?? null,
            title: `Follow up on record #${recordNo}`,
            dueDate: toDate(dto.followUpDate),
            assignedToUserId: dto.assignedToUserId ?? ctx.userId,
            createdByUserId: ctx.userId,
          },
        });
      }
      if (dto.post && record.postingStatus === 'UNPOSTED')
        record = await this.postInTx(tx, ctx, record);
      await this.audit.tenant(tx, ctx, {
        action: 'record.created',
        targetType: 'record',
        targetId: record.id,
        data: { recordNo, service: svc.code, source, posted: record.postingStatus === 'POSTED' },
      });
      return { record, duplicate: false };
    };
    const res = txIn ? await run(txIn) : await this.db.inTenant(ctx, run);
    return { ...(await this.toJson(ctx, res.record)), duplicate: res.duplicate };
  }

  private async event(
    tx: Tx,
    ctx: TenantCtx,
    recordId: string,
    dimension: string,
    from: string | null,
    to: string | null,
    reason: string | null,
    data?: unknown,
  ) {
    await tx.recordStatusEvent.create({
      data: {
        tenantId: ctx.tenantId,
        recordId,
        dimension,
        fromStatus: from,
        toStatus: to,
        reason,
        data: (data ?? undefined) as Prisma.InputJsonValue,
        actorUserId: ctx.userId,
        actorType: ctx.actorType,
      },
    });
  }

  private async loadVisible(tx: Tx, ctx: TenantCtx, id: string, lock = false) {
    if (lock)
      await tx.$queryRaw`SELECT id FROM service_records WHERE id = ${id}::uuid AND "tenantId" = ${ctx.tenantId}::uuid FOR UPDATE`;
    const r = await tx.serviceRecord.findFirst({ where: { ...visibleWhere(ctx), id } });
    if (!r) throw notFound('Record');
    return r;
  }

  private async postInTx(tx: Tx, ctx: TenantCtx, record: ServiceRecord): Promise<ServiceRecord> {
    if (record.postingStatus === 'POSTED')
      throw new AppError('ALREADY_POSTED', 'This record is already posted');
    if (record.postingStatus === 'NOT_REQUIRED')
      throw new AppError('CONFLICT', 'This record has no cash effect to post');
    if (!isPostableStatus(record.workflowType as WorkflowType, record.opStatus as OpStatus)) {
      throw new AppError('INVALID_TRANSITION', 'Only active or completed records can be posted');
    }
    const seq = record.postingSeq + 1;
    const lines = recordPostingLines(this.amountsOf(record));
    const entry = await this.ledger.post(tx, ctx, {
      businessDate: d(record.txnDate)!,
      type: 'RECORD',
      sourceType: 'record',
      sourceId: record.id,
      postingKey: `record:${record.id}:${seq}`,
      description: `Record #${record.recordNo} ${record.serviceCode}`,
      lines,
    });
    const updated = await tx.serviceRecord.update({
      where: { id: record.id },
      data: {
        postingStatus: entry ? 'POSTED' : 'NOT_REQUIRED',
        postingSeq: seq,
        version: { increment: 1 },
        updatedByUserId: ctx.userId,
      },
    });
    await this.event(
      tx,
      ctx,
      record.id,
      'POSTING',
      record.postingStatus,
      updated.postingStatus,
      null,
      { entryId: entry?.id },
    );
    return updated;
  }

  private async reverseInTx(
    tx: Tx,
    ctx: TenantCtx,
    record: ServiceRecord,
    reason: string,
  ): Promise<ServiceRecord> {
    requirePerm(ctx, 'records.reverse');
    if (record.postingStatus !== 'POSTED')
      throw new AppError('NOT_POSTED', 'This record is not posted');
    if (record.amountAllocatedPaise > 0n) {
      throw new AppError(
        'CONFLICT',
        'Collections are allocated to this record. Reverse those collections first.',
        { allocatedPaise: n(record.amountAllocatedPaise) },
      );
    }
    if (record.receivedCommissionPaise > 0n) {
      throw new AppError(
        'CONFLICT',
        'Commission has been received against this record. Record a commission adjustment instead.',
      );
    }
    const entry = await tx.journalEntry.findUnique({
      where: {
        tenantId_postingKey: {
          tenantId: ctx.tenantId,
          postingKey: `record:${record.id}:${record.postingSeq}`,
        },
      },
    });
    if (!entry) throw new AppError('NOT_POSTED', 'Posted entry not found');
    const reversal = await this.ledger.reverse(tx, ctx, entry.id, {
      type: 'RECORD_REVERSAL',
      businessDate: localDate(new Date(), ctx.timezone),
      description: `Reversal of record #${record.recordNo}: ${reason}`.slice(0, 200),
    });
    const updated = await tx.serviceRecord.update({
      where: { id: record.id },
      data: { postingStatus: 'REVERSED', version: { increment: 1 }, updatedByUserId: ctx.userId },
    });
    await this.event(tx, ctx, record.id, 'POSTING', 'POSTED', 'REVERSED', reason, {
      reversalEntryId: reversal.id,
    });
    await this.audit.tenant(tx, ctx, {
      action: 'record.reversed',
      targetType: 'record',
      targetId: record.id,
      data: { reason, reversalEntryId: reversal.id },
    });
    return updated;
  }

  async post(ctx: TenantCtx, id: string, version: number) {
    const r = await this.db.inTenant(ctx, async (tx) => {
      const rec = await this.loadVisible(tx, ctx, id, true);
      if (rec.version !== version) throw versionConflict();
      const updated = await this.postInTx(tx, ctx, rec);
      await this.audit.tenant(tx, ctx, {
        action: 'record.posted',
        targetType: 'record',
        targetId: id,
      });
      return updated;
    });
    return this.toJson(ctx, r);
  }

  async reverse(ctx: TenantCtx, id: string, version: number, reason: string) {
    const r = await this.db.inTenant(ctx, async (tx) => {
      const rec = await this.loadVisible(tx, ctx, id, true);
      if (rec.version !== version) throw versionConflict();
      return this.reverseInTx(tx, ctx, rec, reason);
    });
    return this.toJson(ctx, r);
  }

  async transition(
    ctx: TenantCtx,
    id: string,
    dto: { version: number; to: OpStatus; reason?: string | null; reversePosting?: boolean },
  ) {
    const r = await this.db.inTenant(ctx, async (tx) => {
      let rec = await this.loadVisible(tx, ctx, id, true);
      if (rec.version !== dto.version) throw versionConflict();
      const from = rec.opStatus as OpStatus;
      const wf = rec.workflowType as WorkflowType;
      if (!canTransition(wf, from, dto.to)) {
        throw new AppError('INVALID_TRANSITION', `Cannot change status from ${from} to ${dto.to}`, {
          allowed: allowedTransitions(wf, from),
        });
      }
      if (transitionNeedsReason(from, dto.to) && !dto.reason?.trim()) {
        throw new AppError('VALIDATION_FAILED', 'Give a reason for this change', undefined, {
          reason: ['Required'],
        });
      }
      if (
        rec.source === 'PROVIDER' &&
        rec.connectorStatus !== 'NONE' &&
        ['INITIATED', 'PENDING', 'UNKNOWN'].includes(rec.connectorStatus)
      ) {
        throw new AppError(
          'CONFLICT',
          'Provider outcome is unresolved. Wait for reconciliation before changing status.',
        );
      }
      if (rec.postingStatus === 'POSTED' && (dto.to === 'FAILED' || dto.to === 'CANCELLED')) {
        if (dto.reversePosting === undefined) {
          throw new AppError(
            'CONFLICT',
            'This record is posted to the cashbook. Choose whether to reverse its entries.',
            { requires: 'reversePosting' },
          );
        }
        if (dto.reversePosting)
          rec = await this.reverseInTx(tx, ctx, rec, dto.reason ?? `Status changed to ${dto.to}`);
      }
      const updated = await tx.serviceRecord.update({
        where: { id: rec.id },
        data: { opStatus: dto.to, version: { increment: 1 }, updatedByUserId: ctx.userId },
      });
      await this.event(tx, ctx, rec.id, 'OPERATIONAL', from, dto.to, dto.reason ?? null);
      await this.audit.tenant(tx, ctx, {
        action: 'record.transition',
        targetType: 'record',
        targetId: rec.id,
        data: { from, to: dto.to, reason: dto.reason },
      });
      return updated;
    });
    return this.toJson(ctx, r);
  }

  async update(ctx: TenantCtx, id: string, dto: UpdateDto) {
    const r = await this.db.inTenant(ctx, async (tx) => {
      const rec = await this.loadVisible(tx, ctx, id, true);
      if (rec.version !== dto.version) throw versionConflict();
      const changingFinancial = FINANCIAL_FIELDS.filter((f) => dto[f] !== undefined);
      if (rec.postingStatus === 'POSTED' && changingFinancial.length > 0) {
        throw new AppError(
          'RECORD_LOCKED',
          'Amounts are locked on a posted record. Reverse the posting to correct them.',
          { fields: changingFinancial },
        );
      }
      const svc = await this.resolveService(
        tx,
        ctx,
        rec.serviceCode as ServiceCode,
        rec.customServiceId,
      );
      const details =
        dto.details !== undefined
          ? this.validateDetails(svc, dto.details)
          : (rec.details as Record<string, unknown>);
      const direction =
        dto.details !== undefined
          ? svc.direction(details)
          : (rec.principalDirection as PrincipalDirection);
      if (dto.customerId !== undefined) await this.assertCustomer(tx, ctx, dto.customerId);
      if (dto.assignedToUserId !== undefined)
        await this.assertAssignee(tx, ctx, dto.assignedToUserId);

      const amounts: RecordAmounts = {
        direction,
        principal: dto.principalPaise !== undefined ? big(dto.principalPaise) : rec.principalPaise,
        fee: dto.customerFeePaise !== undefined ? big(dto.customerFeePaise) : rec.customerFeePaise,
        expectedCommission:
          dto.expectedCommissionPaise !== undefined
            ? big(dto.expectedCommissionPaise)
            : rec.expectedCommissionPaise,
        collected:
          dto.amountCollectedPaise !== undefined
            ? big(dto.amountCollectedPaise)
            : rec.amountCollectedPaise,
        paymentMethod: dto.paymentMethod ?? rec.paymentMethod,
        principalMethod: dto.principalMethod ?? rec.principalMethod,
      };
      if (rec.postingStatus === 'POSTED' && direction !== rec.principalDirection) {
        throw new AppError(
          'RECORD_LOCKED',
          'Changing the operation type of a posted record requires reversing it first',
        );
      }
      const { receivable } = validateAmounts(amounts);
      // A new method invalidates the old label unless a matching mode is sent with it.
      const paymentMode =
        dto.paymentMode !== undefined
          ? await this.masters.resolvePaymentMode(tx, ctx, dto.paymentMode, amounts.paymentMethod)
          : dto.paymentMethod && dto.paymentMethod !== rec.paymentMethod
            ? null
            : undefined;
      const provider =
        dto.provider !== undefined
          ? await this.masters.resolveProvider(tx, ctx, dto.provider)
          : undefined;
      // Same rule as the payment mode: a changed method drops the old receiving account.
      const paymentAccountId =
        dto.paymentAccountId !== undefined
          ? await this.paymentAccounts.resolveForRecord(
              tx,
              ctx,
              dto.paymentAccountId,
              amounts.paymentMethod,
            )
          : dto.paymentMethod && dto.paymentMethod !== rec.paymentMethod
            ? null
            : undefined;
      const paid = amounts.collected + rec.amountAllocatedPaise;
      if (paid > receivable)
        throw new AppError('AMOUNT_EXCEEDS_DUE', 'Collections exceed the new amount owed');
      const hasLines = recordPostingLines(amounts).length > 0;
      const postingStatus =
        rec.postingStatus === 'POSTED'
          ? 'POSTED'
          : hasLines
            ? rec.postingStatus === 'REVERSED'
              ? 'REVERSED'
              : 'UNPOSTED'
            : 'NOT_REQUIRED';

      const res = await tx.serviceRecord.updateMany({
        where: { id: rec.id, tenantId: ctx.tenantId, version: dto.version },
        data: {
          customerId: dto.customerId !== undefined ? dto.customerId : undefined,
          walkInName: dto.walkInName !== undefined ? dto.walkInName : undefined,
          txnDate: dto.txnDate ? toDate(dto.txnDate) : undefined,
          principalPaise: amounts.principal,
          customerFeePaise: amounts.fee,
          expectedCommissionPaise: amounts.expectedCommission,
          amountCollectedPaise: amounts.collected,
          paymentMethod: amounts.paymentMethod,
          principalMethod: amounts.principalMethod,
          paymentMode,
          paymentAccountId,
          provider,
          principalDirection: direction,
          amountDuePaise: receivable - paid,
          paymentStatus: paymentStatusFor(receivable, paid),
          postingStatus,
          externalRef: dto.externalRef !== undefined ? dto.externalRef : undefined,
          assignedToUserId: dto.assignedToUserId !== undefined ? dto.assignedToUserId : undefined,
          notes: dto.notes !== undefined ? dto.notes : undefined,
          followUpDate:
            dto.followUpDate !== undefined
              ? dto.followUpDate
                ? toDate(dto.followUpDate)
                : null
              : undefined,
          details: details as Prisma.InputJsonValue,
          version: { increment: 1 },
          updatedByUserId: ctx.userId,
        },
      });
      if (res.count !== 1) throw versionConflict();
      const changed = Object.keys(dto).filter((k) => k !== 'version');
      await this.event(tx, ctx, rec.id, 'EDIT', null, null, null, { fields: changed });
      await this.audit.tenant(tx, ctx, {
        action: 'record.updated',
        targetType: 'record',
        targetId: rec.id,
        data: { fields: changed },
      });
      return tx.serviceRecord.findUniqueOrThrow({ where: { id: rec.id } });
    });
    return this.toJson(ctx, r);
  }

  async list(ctx: TenantCtx, q: z.infer<typeof recordListQuery>) {
    return this.db.inTenant(ctx, async (tx) => {
      const where: Prisma.ServiceRecordWhereInput = { ...visibleWhere(ctx) };
      const and: Prisma.ServiceRecordWhereInput[] = [];
      if (q.service) where.serviceCode = q.service;
      if (q.customServiceId) where.customServiceId = q.customServiceId;
      if (q.status) where.opStatus = q.status;
      if (q.paymentStatus) where.paymentStatus = q.paymentStatus;
      if (q.customerId) where.customerId = q.customerId;
      if (q.from || q.to)
        where.txnDate = {
          ...(q.from ? { gte: toDate(q.from) } : {}),
          ...(q.to ? { lte: toDate(q.to) } : {}),
        };
      if (q.mine === 'true')
        and.push({ OR: [{ createdByUserId: ctx.userId }, { assignedToUserId: ctx.userId }] });
      if (q.q) {
        const term = q.q.trim();
        const or: Prisma.ServiceRecordWhereInput[] = [
          { externalRef: { contains: term, mode: 'insensitive' } },
          { walkInName: { contains: term, mode: 'insensitive' } },
          { customer: { nameLower: { contains: term.toLowerCase() } } },
        ];
        if (/^\d{1,9}$/.test(term)) or.push({ recordNo: Number(term) });
        and.push({ OR: or });
      }
      if (and.length) where.AND = and;
      const [items, total] = [
        await tx.serviceRecord.findMany({
          where,
          orderBy: [{ txnDate: 'desc' }, { recordNo: 'desc' }],
          include: { customer: { select: { id: true, name: true } } },
          ...paginate(q.page, q.pageSize),
        }),
        await tx.serviceRecord.count({ where }),
      ];
      const json = [];
      for (const it of items) json.push(await this.toJson(ctx, it, tx));
      return pageResult(json, total, q.page, q.pageSize);
    });
  }

  /** Customer receipt data, plus the customer's contact details for sending it. */
  async receipt(ctx: TenantCtx, id: string) {
    return this.db.inTenant(ctx, async (tx) => {
      const rec = await this.loadVisible(tx, ctx, id);
      const [tenant, customer, customService] = await Promise.all([
        tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
        rec.customerId
          ? tx.customer.findFirst({
              where: { id: rec.customerId, tenantId: ctx.tenantId },
              select: { name: true, phone: true, email: true },
            })
          : null,
        rec.customServiceId
          ? tx.customServiceDefinition.findFirst({
              where: { id: rec.customServiceId, tenantId: ctx.tenantId },
              select: { name: true, fields: true },
            })
          : null,
      ]);
      return {
        receipt: buildReceipt({ ...rec, customer }, tenant, { customService }),
        contact: { phone: customer?.phone ?? null, email: customer?.email ?? null },
      };
    });
  }

  async get(ctx: TenantCtx, id: string) {
    return this.db.inTenant(ctx, async (tx) => {
      const rec = await this.loadVisible(tx, ctx, id);
      const [events, allocations, attachments, followUps, entries] = [
        await tx.recordStatusEvent.findMany({
          where: { tenantId: ctx.tenantId, recordId: id },
          orderBy: { createdAt: 'asc' },
        }),
        await tx.paymentAllocation.findMany({
          where: { tenantId: ctx.tenantId, recordId: id },
          include: { collection: true },
          orderBy: { createdAt: 'asc' },
        }),
        await tx.attachment.findMany({
          where: { tenantId: ctx.tenantId, ownerType: 'RECORD', ownerId: id, deletedAt: null },
        }),
        await tx.followUpTask.findMany({
          where: { tenantId: ctx.tenantId, recordId: id },
          orderBy: { dueDate: 'asc' },
        }),
        ctx.permissions.has('cashbook.view') || ctx.permissions.has('records.post')
          ? await tx.journalEntry.findMany({
              where: { tenantId: ctx.tenantId, sourceType: 'record', sourceId: id },
              include: { lines: { include: { account: { select: { key: true, name: true } } } } },
              orderBy: { entryNo: 'asc' },
            })
          : [],
      ];
      return {
        ...(await this.toJson(ctx, rec, tx)),
        allowedTransitions: allowedTransitions(
          rec.workflowType as WorkflowType,
          rec.opStatus as OpStatus,
        ),
        events: events.map((e) => ({
          id: e.id,
          dimension: e.dimension,
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          reason: e.reason,
          data: e.data,
          actorUserId: e.actorUserId,
          actorType: e.actorType,
          createdAt: e.createdAt,
        })),
        allocations: allocations.map((a) => ({
          id: a.id,
          amountPaise: n(a.amountPaise),
          collectionId: a.collectionId,
          receiptNo: a.collection.receiptNo,
          method: a.collection.method,
          receivedOn: d(a.collection.receivedOn),
          reversed: !!a.collection.reversedAt,
        })),
        attachments: attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          scanStatus: a.scanStatus,
          createdAt: a.createdAt,
        })),
        followUps: followUps.map((f) => ({
          id: f.id,
          title: f.title,
          dueDate: d(f.dueDate),
          status: f.status,
          version: f.version,
        })),
        journal: entries.map((e) => ({
          id: e.id,
          entryNo: e.entryNo,
          type: e.type,
          businessDate: d(e.businessDate),
          description: e.description,
          reversedByEntryId: e.reversedByEntryId,
          lines: e.lines.map((l) => ({
            account: l.account.key,
            accountName: l.account.name,
            debitPaise: n(l.debitPaise),
            creditPaise: n(l.creditPaise),
            memo: l.memo,
          })),
        })),
      };
    });
  }

  /** Response shape. Sensitive detail fields are masked unless the viewer may see them. */
  async toJson(
    ctx: TenantCtx,
    r: ServiceRecord & { customer?: { id: string; name: string } | null },
    tx?: Tx,
  ) {
    const canSensitive = ctx.permissions.has('customers.view_sensitive');
    const details = { ...(r.details as Record<string, unknown>) };
    if (!canSensitive && r.serviceCode !== 'CUSTOM') {
      for (const f of SERVICE_REGISTRY[r.serviceCode as ServiceCode]?.fields ?? []) {
        if (f.sensitive && typeof details[f.key] === 'string')
          details[f.key] = maskIdentifier(details[f.key] as string);
      }
    }
    let customer = r.customer ?? null;
    if (customer === null && r.customerId && tx) {
      customer = await tx.customer.findFirst({
        where: { id: r.customerId, tenantId: ctx.tenantId },
        select: { id: true, name: true },
      });
    }
    return {
      id: r.id,
      recordNo: r.recordNo,
      serviceCode: r.serviceCode,
      customServiceId: r.customServiceId,
      workflowType: r.workflowType,
      principalDirection: r.principalDirection,
      customerId: r.customerId,
      customer,
      walkInName: r.walkInName,
      txnDate: d(r.txnDate),
      principalPaise: n(r.principalPaise),
      customerFeePaise: n(r.customerFeePaise),
      expectedCommissionPaise: n(r.expectedCommissionPaise),
      receivedCommissionPaise: n(r.receivedCommissionPaise),
      paymentMethod: r.paymentMethod,
      paymentMode: r.paymentMode,
      paymentAccountId: r.paymentAccountId,
      provider: r.provider,
      principalMethod: r.principalMethod,
      amountCollectedPaise: n(r.amountCollectedPaise),
      amountAllocatedPaise: n(r.amountAllocatedPaise),
      amountDuePaise: n(r.amountDuePaise),
      receivablePaise: n(
        receivableFor(
          r.principalDirection as PrincipalDirection,
          r.principalPaise,
          r.customerFeePaise,
        ),
      ),
      externalRef: r.externalRef,
      assignedToUserId: r.assignedToUserId,
      notes: r.notes,
      followUpDate: d(r.followUpDate),
      details,
      source: r.source,
      /** Manual records are operator-reported, not proof that money moved or a service completed. */
      isManual: r.source !== 'PROVIDER',
      opStatus: r.opStatus,
      paymentStatus: r.paymentStatus,
      postingStatus: r.postingStatus,
      connectorStatus: r.connectorStatus,
      clientRef: r.clientRef,
      createdByUserId: r.createdByUserId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      version: r.version,
    };
  }
}
