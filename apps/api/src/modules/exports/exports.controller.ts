import { Body, Controller, Get, OnModuleInit, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { ExportJob, Prisma } from '@prisma/client';
import {
  effectivePermissions,
  exportCreateSchema,
  paiseToDecimalString,
  type TenantRole,
} from '@csp2all/shared';
import type { z } from 'zod';
import { Ctx, TenantAccess } from '../../common/access';
import { Db, type TenantCtx, type Tx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { AppError, notFound } from '../../common/errors';
import { AuditService } from '../../common/audit';
import { toCsv } from '../../common/csv';
import { d, toDate } from '../../common/serialize';
import { JobsService } from '../../jobs/jobs.service';
import { StorageService } from '../storage/storage.service';
import { EntitlementsService } from '../subscription/entitlements.service';
import { visibleWhere } from '../records/records.service';

const EXPORT_TTL_HOURS = 24;
const MAX_ROWS = 100_000;
const money = (v: bigint) => paiseToDecimalString(v);

function jobJson(j: ExportJob) {
  return {
    id: j.id,
    type: j.type,
    params: j.params,
    status: j.status,
    rowCount: j.rowCount,
    error: j.error,
    expiresAt: j.expiresAt,
    createdAt: j.createdAt,
    completedAt: j.completedAt,
  };
}

@Controller('v1/exports')
export class ExportsController implements OnModuleInit {
  constructor(
    private readonly db: Db,
    private readonly jobs: JobsService,
    private readonly storage: StorageService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    this.jobs.register('export.generate', (p) =>
      this.generate(p.tenantId as string, p.exportId as string),
    );
  }

  @Post()
  @TenantAccess('exports.create')
  @ApiDoc({
    summary: 'Request a CSV export (generated asynchronously; formula-injection safe)',
    tags: ['Exports'],
    body: exportCreateSchema,
  })
  create(@Ctx() ctx: TenantCtx, @Body() body: unknown) {
    const dto = parse(exportCreateSchema, body);
    return this.db
      .inTenant(ctx, async (tx) => {
        await this.entitlements.assertBoolean(tx, ctx.tenantId, 'exportsEnabled');
        if (dto.type === 'LEDGER' && !ctx.permissions.has('reports.financial'))
          throw new AppError('PERMISSION_DENIED', 'Ledger exports need financial report access', {
            permission: 'reports.financial',
          });
        if (dto.type === 'EXPENSES' && !ctx.permissions.has('expenses.view'))
          throw new AppError('PERMISSION_DENIED', 'Not allowed', { permission: 'expenses.view' });
        if (dto.type === 'CUSTOMERS' && !ctx.permissions.has('customers.view'))
          throw new AppError('PERMISSION_DENIED', 'Not allowed', { permission: 'customers.view' });
        const job = await tx.exportJob.create({
          data: {
            tenantId: ctx.tenantId,
            requestedByUserId: ctx.userId,
            type: dto.type,
            params: dto as Prisma.InputJsonValue,
          },
        });
        await this.jobs.enqueue(
          tx,
          'export.generate',
          { tenantId: ctx.tenantId, exportId: job.id },
          { tenantId: ctx.tenantId, dedupeKey: `export:${job.id}` },
        );
        await this.audit.tenant(tx, ctx, {
          action: 'export.requested',
          targetType: 'export',
          targetId: job.id,
          data: dto,
        });
        return jobJson(job);
      })
      .finally(() => this.jobs.kick());
  }

  @Get()
  @TenantAccess('exports.create')
  @ApiDoc({ summary: 'Your recent exports', tags: ['Exports'] })
  list(@Ctx() ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => ({
      items: (
        await tx.exportJob.findMany({
          where: { tenantId: ctx.tenantId, requestedByUserId: ctx.userId },
          orderBy: { createdAt: 'desc' },
          take: 30,
        })
      ).map(jobJson),
    }));
  }

  @Get(':id')
  @TenantAccess('exports.create')
  @ApiDoc({ summary: 'Export status', tags: ['Exports'] })
  get(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.inTenant(ctx, async (tx) => {
      const j = await tx.exportJob.findFirst({
        where: { id, tenantId: ctx.tenantId, requestedByUserId: ctx.userId },
      });
      if (!j) throw notFound('Export');
      return jobJson(j);
    });
  }

  @Get(':id/download')
  @TenantAccess('exports.create')
  @ApiDoc({
    summary: 'Short-lived download link (only for the requester, before expiry)',
    tags: ['Exports'],
  })
  download(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.inTenant(ctx, async (tx) => {
      const j = await tx.exportJob.findFirst({
        where: { id, tenantId: ctx.tenantId, requestedByUserId: ctx.userId },
      });
      if (!j) throw notFound('Export');
      if (j.status !== 'READY' || !j.storageKey)
        throw new AppError('CONFLICT', `Export is ${j.status.toLowerCase()}`);
      if (j.expiresAt && j.expiresAt < new Date())
        throw new AppError('CONFLICT', 'This export has expired. Request a new one.');
      await this.audit.tenant(tx, ctx, {
        action: 'export.downloaded',
        targetType: 'export',
        targetId: id,
      });
      return this.storage.signedUrl(
        j.storageKey,
        `csp2all-${j.type.toLowerCase()}-${j.createdAt.toISOString().slice(0, 10)}.csv`,
        'text/csv',
      );
    });
  }

  /**
   * Job handler. Re-authorizes the requester at run time (membership may have changed) and
   * builds the context from stored ids only — never from job payload claims.
   */
  async generate(tenantId: string, exportId: string) {
    const job = await this.db.asSystem((tx) =>
      tx.exportJob.findFirst({ where: { id: exportId, tenantId } }),
    );
    if (!job || job.status === 'READY' || job.status === 'EXPIRED') return;
    const ctxBase = { tenantId, userId: job.requestedByUserId };
    try {
      const { csv, rows } = await this.db.inTenant(ctxBase, async (tx) => {
        const m = await tx.membership.findUnique({
          where: { tenantId_userId: { tenantId, userId: job.requestedByUserId } },
        });
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        const perms =
          m && m.status === 'ACTIVE'
            ? effectivePermissions(m.role as TenantRole, m.grants, m.revokes)
            : new Set<never>();
        if (!perms.has('exports.create'))
          throw new AppError('PERMISSION_DENIED', 'Requester no longer has export permission');
        await this.entitlements.assertBoolean(tx, tenantId, 'exportsEnabled');
        await tx.exportJob.update({ where: { id: exportId }, data: { status: 'RUNNING' } });
        const ctx: TenantCtx = {
          ...ctxBase,
          membershipId: m!.id,
          role: m!.role as TenantRole,
          permissions: perms,
          timezone: tenant.timezone,
          actorType: 'SYSTEM',
        };
        return this.build(tx, ctx, job.params as z.infer<typeof exportCreateSchema>);
      });
      const key = `tenants/${tenantId}/exports/${exportId}.csv`;
      await this.storage.put(key, Buffer.from(csv, 'utf8'), 'text/csv');
      await this.db.inTenant(ctxBase, async (tx) => {
        await tx.exportJob.update({
          where: { id: exportId },
          data: {
            status: 'READY',
            storageKey: key,
            rowCount: rows,
            completedAt: new Date(),
            expiresAt: new Date(Date.now() + EXPORT_TTL_HOURS * 3.6e6),
          },
        });
        await tx.notification.create({
          data: {
            tenantId,
            userId: job.requestedByUserId,
            type: 'EXPORT_READY',
            title: 'Your export is ready',
            body: `${job.type} export with ${rows} rows. Download within ${EXPORT_TTL_HOURS} hours.`,
            link: '/app/reports',
          },
        });
      });
    } catch (e) {
      await this.db.inTenant(ctxBase, (tx) =>
        tx.exportJob.update({
          where: { id: exportId },
          data: { status: 'FAILED', error: (e as Error).message.slice(0, 300) },
        }),
      );
      if (!(e instanceof AppError)) throw e;
    }
  }

  private async build(
    tx: Tx,
    ctx: TenantCtx,
    p: z.infer<typeof exportCreateSchema>,
  ): Promise<{ csv: string; rows: number }> {
    const range =
      p.from || p.to
        ? { ...(p.from ? { gte: toDate(p.from) } : {}), ...(p.to ? { lte: toDate(p.to) } : {}) }
        : undefined;
    switch (p.type) {
      case 'RECORDS': {
        const rs = await tx.serviceRecord.findMany({
          where: {
            ...visibleWhere(ctx),
            ...(p.serviceCode ? { serviceCode: p.serviceCode } : {}),
            ...(range ? { txnDate: range } : {}),
          },
          include: { customer: { select: { name: true } } },
          orderBy: { recordNo: 'asc' },
          take: MAX_ROWS,
        });
        const rows = rs.map((r) => [
          r.recordNo,
          d(r.txnDate),
          r.serviceCode,
          r.customer?.name ?? r.walkInName ?? '',
          r.opStatus,
          r.paymentStatus,
          r.postingStatus,
          r.source,
          money(r.principalPaise),
          money(r.customerFeePaise),
          money(r.expectedCommissionPaise),
          money(r.receivedCommissionPaise),
          money(r.amountCollectedPaise + r.amountAllocatedPaise),
          money(r.amountDuePaise),
          r.externalRef ?? '',
          r.notes ?? '',
        ]);
        return {
          csv: toCsv(
            [
              'Record no',
              'Date',
              'Service',
              'Customer',
              'Status',
              'Payment status',
              'Posting',
              'Source',
              'Transaction amount (INR)',
              'Customer fee (INR)',
              'Expected commission (INR)',
              'Commission received (INR)',
              'Collected (INR)',
              'Due (INR)',
              'External reference',
              'Notes',
            ],
            rows,
          ),
          rows: rows.length,
        };
      }
      case 'CUSTOMERS': {
        const sens = ctx.permissions.has('customers.view_sensitive');
        const cs = await tx.customer.findMany({
          where: { tenantId: ctx.tenantId },
          orderBy: { nameLower: 'asc' },
          take: MAX_ROWS,
        });
        const rows = cs.map((c) => [
          c.name,
          sens ? (c.phone ?? '') : c.phone ? '(hidden)' : '',
          sens ? (c.email ?? '') : c.email ? '(hidden)' : '',
          c.followUpPreference,
          c.archivedAt ? 'archived' : 'active',
          c.notes ?? '',
        ]);
        return {
          csv: toCsv(['Name', 'Phone', 'Email', 'Follow-up preference', 'Status', 'Notes'], rows),
          rows: rows.length,
        };
      }
      case 'DUES': {
        const rs = await tx.serviceRecord.findMany({
          where: { ...visibleWhere(ctx), postingStatus: 'POSTED', amountDuePaise: { gt: 0 } },
          include: { customer: { select: { name: true } } },
          orderBy: { txnDate: 'asc' },
          take: MAX_ROWS,
        });
        const rows = rs.map((r) => [
          r.recordNo,
          d(r.txnDate),
          r.serviceCode,
          r.customer?.name ?? r.walkInName ?? '',
          money(r.amountDuePaise),
          r.paymentStatus,
        ]);
        return {
          csv: toCsv(
            ['Record no', 'Date', 'Service', 'Customer', 'Due (INR)', 'Payment status'],
            rows,
          ),
          rows: rows.length,
        };
      }
      case 'EXPENSES': {
        const es = await tx.expense.findMany({
          where: { tenantId: ctx.tenantId, ...(range ? { paidOn: range } : {}) },
          orderBy: { paidOn: 'asc' },
          take: MAX_ROWS,
        });
        const rows = es.map((e) => [
          d(e.paidOn),
          e.category,
          money(e.amountPaise),
          e.method,
          e.vendor ?? '',
          e.reversedAt ? 'reversed' : '',
          e.notes ?? '',
        ]);
        return {
          csv: toCsv(
            ['Date', 'Category', 'Amount (INR)', 'Paid from', 'Vendor', 'Reversed', 'Notes'],
            rows,
          ),
          rows: rows.length,
        };
      }
      case 'LEDGER': {
        const ls = await tx.journalLine.findMany({
          where: { tenantId: ctx.tenantId, ...(range ? { businessDate: range } : {}) },
          include: { entry: true, account: true },
          orderBy: [{ businessDate: 'asc' }, { entry: { entryNo: 'asc' } }],
          take: MAX_ROWS,
        });
        const rows = ls.map((l) => [
          d(l.businessDate),
          l.entry.entryNo,
          l.entry.type,
          l.account.code,
          l.account.name,
          money(l.debitPaise),
          money(l.creditPaise),
          l.entry.description,
          l.memo ?? '',
        ]);
        return {
          csv: toCsv(
            [
              'Business date',
              'Entry no',
              'Type',
              'Account code',
              'Account',
              'Debit (INR)',
              'Credit (INR)',
              'Description',
              'Memo',
            ],
            rows,
          ),
          rows: rows.length,
        };
      }
    }
  }
}
