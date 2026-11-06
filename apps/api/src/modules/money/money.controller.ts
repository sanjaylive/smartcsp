import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import {
  cashAdjustmentSchema,
  collectionCreateSchema,
  collectionReverseSchema,
  commissionReceiptSchema,
  expenseCreateSchema,
  expenseReverseSchema,
  FUND_ACCOUNTS,
  fundTransferSchema,
  isoDate,
  localDate,
  openingBalanceSchema,
} from '@csp2all/shared';
import { Ctx, TenantAccess, type AppRequest } from '../../common/access';
import type { TenantCtx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { IdempotencyService, readIdempotencyKey } from '../../common/idempotency';
import { MoneyService } from './money.service';

const rangeQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });
const cashbookQuery = z.object({
  date: isoDate.optional(),
  account: z.enum(FUND_ACCOUNTS).default('CASH'),
});
const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) });

@Controller('v1')
export class MoneyController {
  constructor(
    private readonly money: MoneyService,
    private readonly idem: IdempotencyService,
  ) {}

  private scope(ctx: TenantCtx) {
    return `tenant:${ctx.tenantId}:user:${ctx.userId}`;
  }

  @Get('dues')
  @TenantAccess('dues.view')
  @ApiDoc({
    summary: 'Outstanding customer dues grouped by customer (posted records only)',
    tags: ['Dues'],
  })
  dues(@Ctx() ctx: TenantCtx) {
    return this.money.dues(ctx);
  }

  @Get('collections')
  @TenantAccess('dues.view')
  @ApiDoc({ summary: 'List due collections', tags: ['Dues'], query: rangeQuery })
  collections(@Ctx() ctx: TenantCtx, @Query() q: unknown) {
    const r = parse(rangeQuery, q);
    return this.money.listCollections(ctx, r.from, r.to);
  }

  @Post('collections')
  @TenantAccess('dues.collect')
  @ApiDoc({
    summary: 'Record a (partial) due collection allocated to records',
    tags: ['Dues'],
    body: collectionCreateSchema,
    idempotent: true,
  })
  collect(@Ctx() ctx: TenantCtx, @Body() body: unknown, @Req() req: AppRequest) {
    const dto = parse(collectionCreateSchema, body);
    return this.idem.run(
      this.scope(ctx),
      readIdempotencyKey(req.headers),
      'POST /v1/collections',
      body,
      () => this.money.collect(ctx, dto),
    );
  }

  @Post('collections/:id/reverse')
  @HttpCode(200)
  @TenantAccess('dues.collect', 'records.reverse')
  @ApiDoc({
    summary: 'Reverse a collection (compensating entry; dues are restored)',
    tags: ['Dues'],
    body: collectionReverseSchema,
  })
  reverseCollection(
    @Ctx() ctx: TenantCtx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.money.reverseCollection(ctx, id, parse(collectionReverseSchema, body).reason);
  }

  @Get('expenses')
  @TenantAccess('expenses.view')
  @ApiDoc({ summary: 'List expenses', tags: ['Expenses'], query: rangeQuery })
  expenses(@Ctx() ctx: TenantCtx, @Query() q: unknown) {
    const r = parse(rangeQuery, q);
    return this.money.listExpenses(ctx, r.from, r.to);
  }

  @Post('expenses')
  @TenantAccess('expenses.create')
  @ApiDoc({
    summary: 'Record an expense',
    tags: ['Expenses'],
    body: expenseCreateSchema,
    idempotent: true,
  })
  createExpense(@Ctx() ctx: TenantCtx, @Body() body: unknown, @Req() req: AppRequest) {
    const dto = parse(expenseCreateSchema, body);
    return this.idem.run(
      this.scope(ctx),
      readIdempotencyKey(req.headers),
      'POST /v1/expenses',
      body,
      () => this.money.createExpense(ctx, dto),
    );
  }

  @Post('expenses/:id/reverse')
  @HttpCode(200)
  @TenantAccess('expenses.reverse')
  @ApiDoc({ summary: 'Reverse an expense', tags: ['Expenses'], body: expenseReverseSchema })
  reverseExpense(
    @Ctx() ctx: TenantCtx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.money.reverseExpense(ctx, id, parse(expenseReverseSchema, body).reason);
  }

  @Get('cashbook')
  @TenantAccess('cashbook.view')
  @ApiDoc({
    summary: 'Cashbook for a business date and fund account, with running balance',
    tags: ['Cashbook'],
    query: cashbookQuery,
  })
  cashbook(@Ctx() ctx: TenantCtx, @Query() q: unknown) {
    const r = parse(cashbookQuery, q);
    return this.money.cashbook(ctx, r.date ?? localDate(new Date(), ctx.timezone), r.account);
  }

  @Post('cashbook/opening')
  @TenantAccess('cashbook.manage')
  @ApiDoc({
    summary: 'Set an opening balance (Dr fund account, Cr owner capital)',
    tags: ['Cashbook'],
    body: openingBalanceSchema,
    idempotent: true,
  })
  opening(@Ctx() ctx: TenantCtx, @Body() body: unknown, @Req() req: AppRequest) {
    const dto = parse(openingBalanceSchema, body);
    return this.idem.run(
      this.scope(ctx),
      readIdempotencyKey(req.headers),
      'POST /v1/cashbook/opening',
      body,
      () => this.money.opening(ctx, dto),
    );
  }

  @Post('cashbook/adjustments')
  @TenantAccess('cashbook.manage')
  @ApiDoc({
    summary: 'Adjust a fund balance with a reason (posts to Cash over/short)',
    tags: ['Cashbook'],
    body: cashAdjustmentSchema,
    idempotent: true,
  })
  adjust(@Ctx() ctx: TenantCtx, @Body() body: unknown, @Req() req: AppRequest) {
    const dto = parse(cashAdjustmentSchema, body);
    return this.idem.run(
      this.scope(ctx),
      readIdempotencyKey(req.headers),
      'POST /v1/cashbook/adjustments',
      body,
      () => this.money.adjust(ctx, dto),
    );
  }

  @Post('cashbook/transfers')
  @TenantAccess('cashbook.manage')
  @ApiDoc({
    summary: 'Move funds between cash, bank and provider wallet',
    tags: ['Cashbook'],
    body: fundTransferSchema,
    idempotent: true,
  })
  transfer(@Ctx() ctx: TenantCtx, @Body() body: unknown, @Req() req: AppRequest) {
    const dto = parse(fundTransferSchema, body);
    return this.idem.run(
      this.scope(ctx),
      readIdempotencyKey(req.headers),
      'POST /v1/cashbook/transfers',
      body,
      () => this.money.transfer(ctx, dto),
    );
  }

  @Post('journal/:id/reverse')
  @HttpCode(200)
  @TenantAccess('cashbook.manage')
  @ApiDoc({
    summary: 'Reverse a manual cashbook entry (opening, adjustment, transfer)',
    tags: ['Cashbook'],
    body: reasonSchema,
  })
  reverseJournal(
    @Ctx() ctx: TenantCtx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.money.reverseManualEntry(ctx, id, parse(reasonSchema, body).reason);
  }

  @Get('commissions')
  @TenantAccess('commissions.view')
  @ApiDoc({ summary: 'Expected vs received commissions', tags: ['Commissions'] })
  commissions(@Ctx() ctx: TenantCtx) {
    return this.money.commissions(ctx);
  }

  @Post('commissions/receipts')
  @TenantAccess('commissions.receive')
  @ApiDoc({
    summary: 'Record commission received from a provider',
    tags: ['Commissions'],
    body: commissionReceiptSchema,
    idempotent: true,
  })
  receiveCommission(@Ctx() ctx: TenantCtx, @Body() body: unknown, @Req() req: AppRequest) {
    const dto = parse(commissionReceiptSchema, body);
    return this.idem.run(
      this.scope(ctx),
      readIdempotencyKey(req.headers),
      'POST /v1/commissions/receipts',
      body,
      () => this.money.receiveCommission(ctx, dto),
    );
  }
}
