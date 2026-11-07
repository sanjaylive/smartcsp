import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Customer, Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  customerCreateSchema,
  customerListQuery,
  customerUpdateSchema,
  followUpCreateSchema,
  followUpUpdateSchema,
  isoDate,
  maskEmail,
  maskIdentifier,
  pagination,
} from '@csp2all/shared';
import { Ctx, TenantAccess } from '../../common/access';
import { Db, type TenantCtx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { AppError, notFound, versionConflict } from '../../common/errors';
import { AuditService } from '../../common/audit';
import { d, n, pageResult, paginate, toDate } from '../../common/serialize';
import { visibleWhere } from '../records/records.service';
import { Sms21Service } from '../messaging/sms21.service';

export function customerJson(ctx: TenantCtx, c: Customer) {
  const sensitive = ctx.permissions.has('customers.view_sensitive');
  return {
    id: c.id,
    name: c.name,
    phone: sensitive ? c.phone : maskIdentifier(c.phone),
    email: sensitive ? c.email : c.email ? maskEmail(c.email) : null,
    phoneMasked: !sensitive && !!c.phone,
    notes: c.notes,
    followUpPreference: c.followUpPreference,
    archivedAt: c.archivedAt,
    createdAt: c.createdAt,
    version: c.version,
  };
}

const duplicatesQuery = z.object({
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(15).optional(),
});

@Controller('v1/customers')
export class CustomersController {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly sms21: Sms21Service,
  ) {}

  @Get()
  @TenantAccess('customers.view')
  @ApiDoc({
    summary: 'Search customers (tenant-scoped, paginated)',
    tags: ['Customers'],
    query: customerListQuery,
  })
  list(@Ctx() ctx: TenantCtx, @Query() query: unknown) {
    const q = parse(customerListQuery, query);
    return this.db.inTenant(ctx, async (tx) => {
      const where: Prisma.CustomerWhereInput = {
        tenantId: ctx.tenantId,
        archivedAt: q.archived === 'true' ? { not: null } : null,
      };
      if (q.q) {
        const t = q.q.toLowerCase();
        where.OR = [
          { nameLower: { contains: t } },
          { phone: { contains: t.replace(/\D/g, '') || '__none__' } },
        ];
      }
      const [items, total] = [
        await tx.customer.findMany({
          where,
          orderBy: { nameLower: 'asc' },
          ...paginate(q.page, q.pageSize),
        }),
        await tx.customer.count({ where }),
      ];
      const dues = await tx.serviceRecord.groupBy({
        by: ['customerId'],
        where: {
          tenantId: ctx.tenantId,
          customerId: { in: items.map((i) => i.id) },
          postingStatus: 'POSTED',
          amountDuePaise: { gt: 0 },
        },
        _sum: { amountDuePaise: true },
      });
      const dueMap = new Map(dues.map((x) => [x.customerId, n(x._sum.amountDuePaise)]));
      return pageResult(
        items.map((c) => ({ ...customerJson(ctx, c), outstandingDuePaise: dueMap.get(c.id) ?? 0 })),
        total,
        q.page,
        q.pageSize,
      );
    });
  }

  @Get('duplicates')
  @TenantAccess('customers.view')
  @ApiDoc({
    summary: 'Suggest possible duplicate customers by phone or name',
    tags: ['Customers'],
    query: duplicatesQuery,
  })
  duplicates(@Ctx() ctx: TenantCtx, @Query() query: unknown) {
    const q = parse(duplicatesQuery, query);
    return this.db.inTenant(ctx, async (tx) => {
      const or: Prisma.CustomerWhereInput[] = [];
      if (q.phone && /^\d{10}$/.test(q.phone)) or.push({ phone: q.phone });
      if (q.name && q.name.length >= 3) {
        const lower = q.name.toLowerCase();
        or.push({ nameLower: lower }, { nameLower: { startsWith: lower.split(/\s+/)[0] } });
      }
      if (!or.length) return { items: [] };
      const items = await tx.customer.findMany({
        where: { tenantId: ctx.tenantId, archivedAt: null, OR: or },
        take: 5,
      });
      return { items: items.map((c) => customerJson(ctx, c)) };
    });
  }

  @Post()
  @TenantAccess('customers.manage')
  @ApiDoc({
    summary: 'Create a customer (phone and email optional)',
    tags: ['Customers'],
    body: customerCreateSchema,
  })
  create(@Ctx() ctx: TenantCtx, @Body() body: unknown) {
    const dto = parse(customerCreateSchema, body);
    return this.db.inTenant(ctx, async (tx) => {
      const c = await tx.customer.create({
        data: {
          tenantId: ctx.tenantId,
          name: dto.name,
          nameLower: dto.name.toLowerCase(),
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          notes: dto.notes ?? null,
          followUpPreference: dto.followUpPreference,
          createdByUserId: ctx.userId,
        },
      });
      await this.audit.tenant(tx, ctx, {
        action: 'customer.created',
        targetType: 'customer',
        targetId: c.id,
      });
      return customerJson(ctx, c);
    });
  }

  @Get(':id')
  @TenantAccess('customers.view')
  @ApiDoc({
    summary: 'Customer profile with outstanding dues and service history',
    tags: ['Customers'],
  })
  get(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.inTenant(ctx, async (tx) => {
      const c = await tx.customer.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!c) throw notFound('Customer');
      const records = ctx.permissions.has('records.view')
        ? await tx.serviceRecord.findMany({
            where: { ...visibleWhere(ctx), customerId: id },
            orderBy: { txnDate: 'desc' },
            take: 50,
          })
        : [];
      const due = await tx.serviceRecord.aggregate({
        where: { tenantId: ctx.tenantId, customerId: id, postingStatus: 'POSTED' },
        _sum: { amountDuePaise: true },
      });
      const followUps = await tx.followUpTask.findMany({
        where: { tenantId: ctx.tenantId, customerId: id, status: 'OPEN' },
        orderBy: { dueDate: 'asc' },
      });
      return {
        ...customerJson(ctx, c),
        outstandingDuePaise: n(due._sum.amountDuePaise),
        history: records.map((r) => ({
          id: r.id,
          recordNo: r.recordNo,
          serviceCode: r.serviceCode,
          txnDate: d(r.txnDate),
          opStatus: r.opStatus,
          principalPaise: n(r.principalPaise),
          customerFeePaise: n(r.customerFeePaise),
          amountDuePaise: n(r.amountDuePaise),
          paymentStatus: r.paymentStatus,
          postingStatus: r.postingStatus,
        })),
        followUps: followUps.map((f) => ({
          id: f.id,
          title: f.title,
          dueDate: d(f.dueDate),
          status: f.status,
        })),
      };
    });
  }

  @Patch(':id')
  @TenantAccess('customers.manage')
  @ApiDoc({
    summary: 'Edit a customer (version required)',
    tags: ['Customers'],
    body: customerUpdateSchema,
  })
  update(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const dto = parse(customerUpdateSchema, body);
    return this.db.inTenant(ctx, async (tx) => {
      // Editing contact fields requires seeing them; otherwise masked values could overwrite real ones.
      if (
        (dto.phone !== undefined || dto.email !== undefined) &&
        !ctx.permissions.has('customers.view_sensitive')
      ) {
        throw new AppError('PERMISSION_DENIED', 'You cannot change contact details', {
          permission: 'customers.view_sensitive',
        });
      }
      const res = await tx.customer.updateMany({
        where: { id, tenantId: ctx.tenantId, version: dto.version },
        data: {
          name: dto.name,
          nameLower: dto.name?.toLowerCase(),
          phone: dto.phone,
          email: dto.email,
          notes: dto.notes,
          followUpPreference: dto.followUpPreference,
          version: { increment: 1 },
        },
      });
      if (res.count !== 1) {
        if (!(await tx.customer.findFirst({ where: { id, tenantId: ctx.tenantId } })))
          throw notFound('Customer');
        throw versionConflict();
      }
      await this.audit.tenant(tx, ctx, {
        action: 'customer.updated',
        targetType: 'customer',
        targetId: id,
        data: { fields: Object.keys(dto) },
      });
      return customerJson(ctx, await tx.customer.findUniqueOrThrow({ where: { id } }));
    });
  }

  @Post(':id/archive')
  @HttpCode(200)
  @TenantAccess('customers.manage')
  @ApiDoc({ summary: 'Archive a customer (history is kept)', tags: ['Customers'] })
  archive(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.inTenant(ctx, async (tx) => {
      const c = await tx.customer.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!c) throw notFound('Customer');
      const u = await tx.customer.update({
        where: { id },
        data: { archivedAt: c.archivedAt ? null : new Date(), version: { increment: 1 } },
      });
      await this.audit.tenant(tx, ctx, {
        action: u.archivedAt ? 'customer.archived' : 'customer.restored',
        targetType: 'customer',
        targetId: id,
      });
      return customerJson(ctx, u);
    });
  }

  @Post(':id/remind')
  @HttpCode(200)
  @TenantAccess('customers.manage')
  @ApiDoc({
    summary: 'Send a WhatsApp/SMS reminder to the customer (via SMS21)',
    tags: ['Customers'],
  })
  async remind(
    @Ctx() ctx: TenantCtx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = parse(z.object({ text: z.string().trim().max(400).optional() }), body);
    const cfg = await this.sms21.config();
    if (!cfg.apiKeyEnc)
      throw new AppError('MESSAGING_NOT_CONFIGURED', 'SMS/WhatsApp is not connected yet.');
    if (!cfg.notifyEnabled)
      throw new AppError('MESSAGING_NOT_CONFIGURED', 'Customer reminders are turned off.');

    const { customer, shopName } = await this.db.inTenant(ctx, async (tx) => {
      const c = await tx.customer.findFirst({
        where: { id, tenantId: ctx.tenantId },
        select: { id: true, name: true, phone: true, archivedAt: true },
      });
      if (!c) throw notFound('Customer');
      const shop = await tx.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { name: true },
      });
      return { customer: c, shopName: shop?.name ?? 'our shop' };
    });
    if (!customer.phone)
      throw new AppError('VALIDATION_FAILED', 'This customer has no phone number.', undefined, {
        phone: ['Add a phone number first'],
      });

    const text =
      dto.text ||
      `Dear ${customer.name}, this is a reminder from ${shopName} about your pending dues. Please visit us to settle them. Thank you.`;
    const res = (await this.sms21.notify(customer.phone, text)) as {
      messageId?: string;
      requestId?: string;
    };
    await this.db.inTenant(ctx, (tx) =>
      this.audit.tenant(tx, ctx, {
        action: 'customer.reminder_sent',
        targetType: 'customer',
        targetId: id,
        data: { channel: cfg.otpChannel },
      }),
    );
    return {
      sent: true,
      channel: cfg.otpChannel,
      messageId: res.messageId ?? res.requestId ?? null,
    };
  }
}

const followUpListQuery = pagination.extend({
  status: z.enum(['OPEN', 'DONE', 'CANCELLED']).optional(),
  dueBy: isoDate.optional(),
  mine: z.enum(['true', 'false']).optional(),
});

@Controller('v1/follow-ups')
export class FollowUpsController {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @TenantAccess('followups.view')
  @ApiDoc({ summary: 'List follow-up tasks', tags: ['Follow-ups'], query: followUpListQuery })
  list(@Ctx() ctx: TenantCtx, @Query() query: unknown) {
    const q = parse(followUpListQuery, query);
    return this.db.inTenant(ctx, async (tx) => {
      const where: Prisma.FollowUpTaskWhereInput = {
        tenantId: ctx.tenantId,
        status: q.status ?? 'OPEN',
      };
      if (q.dueBy) where.dueDate = { lte: toDate(q.dueBy) };
      if (q.mine === 'true' || !ctx.permissions.has('records.view_all')) {
        where.OR = [{ assignedToUserId: ctx.userId }, { createdByUserId: ctx.userId }];
      }
      const [items, total] = [
        await tx.followUpTask.findMany({
          where,
          include: { customer: { select: { id: true, name: true } } },
          orderBy: { dueDate: 'asc' },
          ...paginate(q.page, q.pageSize),
        }),
        await tx.followUpTask.count({ where }),
      ];
      return pageResult(
        items.map((f) => ({
          id: f.id,
          title: f.title,
          notes: f.notes,
          dueDate: d(f.dueDate),
          status: f.status,
          recordId: f.recordId,
          customer: f.customer,
          assignedToUserId: f.assignedToUserId,
          completedAt: f.completedAt,
          version: f.version,
        })),
        total,
        q.page,
        q.pageSize,
      );
    });
  }

  @Post()
  @TenantAccess('followups.manage')
  @ApiDoc({ summary: 'Create a follow-up task', tags: ['Follow-ups'], body: followUpCreateSchema })
  create(@Ctx() ctx: TenantCtx, @Body() body: unknown) {
    const dto = parse(followUpCreateSchema, body);
    return this.db.inTenant(ctx, async (tx) => {
      if (
        dto.recordId &&
        !(await tx.serviceRecord.findFirst({ where: { ...visibleWhere(ctx), id: dto.recordId } }))
      )
        throw notFound('Record');
      if (
        dto.customerId &&
        !(await tx.customer.findFirst({ where: { id: dto.customerId, tenantId: ctx.tenantId } }))
      )
        throw notFound('Customer');
      if (
        dto.assignedToUserId &&
        !(await tx.membership.findFirst({
          where: { tenantId: ctx.tenantId, userId: dto.assignedToUserId, status: 'ACTIVE' },
        }))
      ) {
        throw new AppError('VALIDATION_FAILED', 'Assignee is not active staff', undefined, {
          assignedToUserId: ['Not a member'],
        });
      }
      const f = await tx.followUpTask.create({
        data: {
          tenantId: ctx.tenantId,
          title: dto.title,
          notes: dto.notes ?? null,
          dueDate: toDate(dto.dueDate),
          recordId: dto.recordId ?? null,
          customerId: dto.customerId ?? null,
          assignedToUserId: dto.assignedToUserId ?? ctx.userId,
          createdByUserId: ctx.userId,
        },
      });
      return {
        id: f.id,
        title: f.title,
        dueDate: d(f.dueDate),
        status: f.status,
        version: f.version,
      };
    });
  }

  @Patch(':id')
  @TenantAccess('followups.manage')
  @ApiDoc({
    summary: 'Update or complete a follow-up',
    tags: ['Follow-ups'],
    body: followUpUpdateSchema,
  })
  update(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const dto = parse(followUpUpdateSchema, body);
    return this.db.inTenant(ctx, async (tx) => {
      const f = await tx.followUpTask.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!f) throw notFound('Follow-up');
      if (
        !ctx.permissions.has('records.view_all') &&
        f.assignedToUserId !== ctx.userId &&
        f.createdByUserId !== ctx.userId
      )
        throw notFound('Follow-up');
      const res = await tx.followUpTask.updateMany({
        where: { id, tenantId: ctx.tenantId, version: dto.version },
        data: {
          status: dto.status,
          dueDate: dto.dueDate ? toDate(dto.dueDate) : undefined,
          title: dto.title,
          notes: dto.notes,
          assignedToUserId: dto.assignedToUserId,
          completedAt: dto.status === 'DONE' ? new Date() : dto.status ? null : undefined,
          version: { increment: 1 },
        },
      });
      if (res.count !== 1) throw versionConflict();
      const u = await tx.followUpTask.findUniqueOrThrow({ where: { id } });
      return {
        id: u.id,
        title: u.title,
        dueDate: d(u.dueDate),
        status: u.status,
        version: u.version,
      };
    });
  }
}
