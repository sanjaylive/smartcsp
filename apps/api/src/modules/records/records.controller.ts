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
  Req,
} from '@nestjs/common';
import {
  postingPreviewSchema,
  recordCreateSchema,
  recordListQuery,
  recordPostSchema,
  recordReverseSchema,
  recordTransitionSchema,
  recordUpdateSchema,
} from '@csp2all/shared';
import { Ctx, TenantAccess, type AppRequest } from '../../common/access';
import type { TenantCtx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { IdempotencyService, readIdempotencyKey } from '../../common/idempotency';
import { RecordsService } from './records.service';
import { receiptHtml } from './receipt';
import { z } from 'zod';
import { AppError } from '../../common/errors';
import { AuditService } from '../../common/audit';
import { Db } from '../../common/db';
import { RedisService } from '../../common/redis';
import { EmailService } from '../email/email.service';
import { Sms21Service } from '../messaging/sms21.service';

const sendReceiptSchema = z.object({
  channel: z.enum(['email', 'whatsapp']),
  /** Defaults to the customer's saved email / mobile. */
  to: z.string().trim().max(254).optional().nullable(),
});

@Controller('v1/records')
export class RecordsController {
  constructor(
    private readonly records: RecordsService,
    private readonly idem: IdempotencyService,
    private readonly email: EmailService,
    private readonly sms21: Sms21Service,
    private readonly audit: AuditService,
    private readonly db: Db,
    private readonly redis: RedisService,
  ) {}

  @Get(':id/receipt')
  @TenantAccess('records.view')
  @ApiDoc({ summary: 'Customer receipt for a record (for printing or sharing)', tags: ['Records'] })
  async receipt(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string) {
    const { receipt, contact } = await this.records.receipt(ctx, id);
    const sensitive = ctx.permissions.has('customers.view_sensitive');
    return {
      ...receipt,
      // Whether the customer's own contact is on file (so the UI can offer "send to customer").
      canEmailCustomer: !!contact.email,
      canMessageCustomer: !!contact.phone,
      customerPhone: sensitive ? contact.phone : null,
    };
  }

  @Post(':id/receipt/send')
  @HttpCode(200)
  @TenantAccess('records.view')
  @ApiDoc({
    summary: 'Email the receipt, or send it on WhatsApp/SMS through the shop’s SMS21 connection',
    tags: ['Records'],
  })
  async sendReceipt(
    @Ctx() ctx: TenantCtx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = parse(sendReceiptSchema, body);
    const { receipt, contact } = await this.records.receipt(ctx, id);
    // Stop a shop account being used to spam: 30 receipts per shop per hour per channel.
    await this.redis.enforce(`receipt:${dto.channel}:${ctx.tenantId}`, 30, 3600);
    let toMasked: string;
    if (dto.channel === 'email') {
      const to = (dto.to || contact.email || '').toLowerCase();
      const ok = z.email().safeParse(to);
      if (!ok.success)
        throw new AppError('VALIDATION_FAILED', 'Enter a valid email address', undefined, {
          to: ['Enter a valid email address'],
        });
      await this.email.send({
        to,
        template: 'receipt',
        subject: `Receipt ${receipt.receiptNo} from ${receipt.shop.name}`,
        text: receipt.text.replace(/\*/g, ''),
        html: receiptHtml(receipt),
      });
      toMasked = to.replace(/^(.).*(@.*)$/, '$1***$2');
    } else {
      const cfg = await this.sms21.config();
      if (!cfg.apiKeyEnc || !cfg.notifyEnabled)
        throw new AppError(
          'MESSAGING_NOT_CONFIGURED',
          'WhatsApp sending is not connected. Use “Share on WhatsApp” from your phone instead.',
        );
      const to = (dto.to || contact.phone || '').replace(/\D/g, '').slice(-10);
      if (!/^[6-9]\d{9}$/.test(to))
        throw new AppError('VALIDATION_FAILED', 'Enter a 10-digit mobile number', undefined, {
          to: ['Enter a 10-digit mobile number'],
        });
      await this.sms21.notify(to, receipt.text, `receipt:${id}:${to}`);
      toMasked = `••••••${to.slice(-4)}`;
    }
    await this.db.inTenant(ctx, (tx) =>
      this.audit.tenant(tx, ctx, {
        action: 'record.receipt_sent',
        targetType: 'record',
        targetId: id,
        data: { channel: dto.channel, to: toMasked },
      }),
    );
    return { sent: true, channel: dto.channel, to: toMasked };
  }

  @Get()
  @TenantAccess('records.view')
  @ApiDoc({
    summary: 'List service records (own records only unless records.view_all)',
    tags: ['Records'],
    query: recordListQuery,
  })
  list(@Ctx() ctx: TenantCtx, @Query() q: unknown) {
    return this.records.list(ctx, parse(recordListQuery, q));
  }

  @Post()
  @TenantAccess('records.create')
  @ApiDoc({
    summary: 'Create a manual service record',
    tags: ['Records'],
    body: recordCreateSchema,
    idempotent: true,
    description:
      'Records what happened on an external system. Set `post: true` to also post the recorded cash movement. `clientRef` makes mobile sync retries return the original record (`duplicate: true`).',
    example: {
      serviceCode: 'AEPS',
      customerId: null,
      walkInName: 'Ramesh Kumar',
      txnDate: '2026-11-06',
      opStatus: 'SUCCESSFUL',
      principalPaise: 500000,
      customerFeePaise: 1000,
      expectedCommissionPaise: 1250,
      paymentMethod: 'CASH',
      amountCollectedPaise: 1000,
      principalMethod: 'CASH',
      externalRef: 'RRN612345678901',
      details: { operationType: 'CASH_WITHDRAWAL', bankLabel: 'Demo Gramin Bank' },
      post: true,
    },
  })
  create(@Ctx() ctx: TenantCtx, @Body() body: unknown, @Req() req: AppRequest) {
    const dto = parse(recordCreateSchema, body);
    const key = readIdempotencyKey(req.headers);
    const source = req.auth?.via === 'bearer' ? 'MOBILE_SYNC' : 'MANUAL';
    return this.idem.run(
      `tenant:${ctx.tenantId}:user:${ctx.userId}`,
      key,
      'POST /v1/records',
      body,
      () => this.records.create(ctx, dto, source),
    );
  }

  @Post('posting-preview')
  @HttpCode(200)
  @TenantAccess('records.create')
  @ApiDoc({
    summary: 'Preview the cashbook effect of a record without saving',
    tags: ['Records'],
    body: postingPreviewSchema,
  })
  preview(@Ctx() ctx: TenantCtx, @Body() body: unknown) {
    return this.records.preview(ctx, parse(postingPreviewSchema, body));
  }

  @Get(':id')
  @TenantAccess('records.view')
  @ApiDoc({
    summary: 'Record details with status history, allocations and journal',
    tags: ['Records'],
  })
  get(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.records.get(ctx, id);
  }

  @Patch(':id')
  @TenantAccess('records.edit')
  @ApiDoc({
    summary: 'Edit a record (optimistic concurrency via version; amounts locked once posted)',
    tags: ['Records'],
    body: recordUpdateSchema,
  })
  update(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.records.update(ctx, id, parse(recordUpdateSchema, body));
  }

  @Post(':id/transitions')
  @HttpCode(200)
  @TenantAccess('records.transition')
  @ApiDoc({
    summary: 'Change operational status through an allowed transition',
    tags: ['Records'],
    body: recordTransitionSchema,
  })
  transition(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.records.transition(ctx, id, parse(recordTransitionSchema, body));
  }

  @Post(':id/post')
  @HttpCode(200)
  @TenantAccess('records.post')
  @ApiDoc({
    summary: 'Post the recorded cash movement to the cashbook',
    tags: ['Records'],
    body: recordPostSchema,
  })
  post(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.records.post(ctx, id, parse(recordPostSchema, body).version);
  }

  @Post(':id/reverse')
  @HttpCode(200)
  @TenantAccess('records.reverse')
  @ApiDoc({
    summary: 'Reverse the posted cash entries with a compensating entry',
    tags: ['Records'],
    body: recordReverseSchema,
  })
  reverse(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const dto = parse(recordReverseSchema, body);
    return this.records.reverse(ctx, id, dto.version, dto.reason);
  }
}
