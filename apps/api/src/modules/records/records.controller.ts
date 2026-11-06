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

@Controller('v1/records')
export class RecordsController {
  constructor(
    private readonly records: RecordsService,
    private readonly idem: IdempotencyService,
  ) {}

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
