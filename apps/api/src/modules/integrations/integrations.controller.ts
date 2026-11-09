import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { accountVerifySchema, connectorConfigSchema } from '@csp2all/shared';
import { Ctx, Public, TenantAccess, type AppRequest } from '../../common/access';
import type { TenantCtx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { readIdempotencyKey } from '../../common/idempotency';
import {
  IntegrationsService,
  pay2allBillFetchSchema,
  pay2allLookupSchema,
  providerExecuteSchema,
} from './integrations.service';

@Controller('v1')
export class IntegrationsController {
  constructor(private readonly svc: IntegrationsService) {}

  @Get('integrations')
  @TenantAccess('integrations.view')
  @ApiDoc({
    summary: 'Connector status, readiness and missing prerequisites',
    tags: ['Integrations'],
  })
  overview(@Ctx() ctx: TenantCtx) {
    return this.svc.overview(ctx);
  }

  @Put('integrations/pay2all')
  @TenantAccess('integrations.manage')
  @ApiDoc({
    summary:
      'Configure Pay2All: mode (DISABLED = all Offline, UAT test, LIVE), API token (write-only) and Live services',
    tags: ['Integrations'],
    body: connectorConfigSchema,
  })
  configure(@Ctx() ctx: TenantCtx, @Body() body: unknown) {
    return this.svc.configure(ctx, parse(connectorConfigSchema, body));
  }

  @Post('integrations/pay2all/health')
  @HttpCode(200)
  @TenantAccess('integrations.manage')
  @ApiDoc({ summary: 'Run a connector health check', tags: ['Integrations'] })
  health(@Ctx() ctx: TenantCtx) {
    return this.svc.health(ctx);
  }

  @Get('beneficiaries/verify')
  @TenantAccess('records.create')
  @ApiDoc({
    summary: 'Whether beneficiary account names can be verified through the connected provider',
    tags: ['Integrations'],
  })
  accountVerifyStatus(@Ctx() ctx: TenantCtx) {
    return this.svc.accountVerifyStatus(ctx);
  }

  @Post('beneficiaries/verify')
  @HttpCode(200)
  @TenantAccess('records.create')
  @ApiDoc({
    summary: "Look up a bank account holder's name before a transfer (no money moves)",
    tags: ['Integrations'],
    body: accountVerifySchema,
  })
  verifyAccount(@Ctx() ctx: TenantCtx, @Body() body: unknown) {
    return this.svc.verifyAccount(ctx, parse(accountVerifySchema, body));
  }

  @Get('provider-operations')
  @TenantAccess('integrations.view')
  @ApiDoc({
    summary: 'Provider operations and open reconciliation exceptions',
    tags: ['Integrations'],
  })
  list(@Ctx() ctx: TenantCtx) {
    return this.svc.listOperations(ctx);
  }

  @Get('provider-operations/:id')
  @TenantAccess('integrations.view')
  @ApiDoc({ summary: 'Provider operation with its event history', tags: ['Integrations'] })
  get(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.operationJson(ctx, id);
  }

  @Post('provider-operations')
  @HttpCode(200)
  @TenantAccess('provider.execute', 'records.create')
  @ApiDoc({
    summary:
      'Execute a provider operation (simulator only until Pay2All is documented). Idempotency-Key required.',
    tags: ['Integrations'],
    body: providerExecuteSchema,
    idempotent: true,
    description:
      'Creates a PROVIDER-sourced record and sends it. A timeout yields status UNKNOWN: do not retry — reconciliation resolves it.',
  })
  execute(@Ctx() ctx: TenantCtx, @Body() body: unknown, @Req() req: AppRequest) {
    const key = readIdempotencyKey(req.headers, true)!;
    return this.svc.execute(ctx, key, parse(providerExecuteSchema, body));
  }

  @Post('provider-operations/:id/reconcile')
  @HttpCode(200)
  @TenantAccess('integrations.manage')
  @ApiDoc({
    summary: 'Query the provider for the current status of an operation',
    tags: ['Integrations'],
  })
  reconcile(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.reconcileOperation(ctx, id);
  }

  // ---------------------------------------------------------------- Pay2All catalog (read-only)

  @Get('pay2all/providers')
  @TenantAccess('records.create')
  @ApiDoc({ summary: 'Pay2All operators by service (cached)', tags: ['Pay2All'] })
  p2aProviders(@Ctx() ctx: TenantCtx) {
    return this.svc.p2aProviders(ctx);
  }

  @Post('pay2all/lookup')
  @HttpCode(200)
  @TenantAccess('records.create')
  @ApiDoc({
    summary: 'Find the operator and circle of a mobile / DTH number',
    tags: ['Pay2All'],
    body: pay2allLookupSchema,
  })
  p2aLookup(@Ctx() ctx: TenantCtx, @Body() body: unknown) {
    return this.svc.p2aLookup(ctx, parse(pay2allLookupSchema, body));
  }

  @Get('pay2all/plans')
  @TenantAccess('records.create')
  @ApiDoc({ summary: 'Recharge plans for an operator (and circle)', tags: ['Pay2All'] })
  p2aPlans(
    @Ctx() ctx: TenantCtx,
    @Query('providerId') providerId: string,
    @Query('circleId') circleId?: string,
  ) {
    return this.svc.p2aPlans(ctx, providerId ?? '', circleId || undefined);
  }

  @Get('pay2all/bbps/categories')
  @TenantAccess('records.create')
  @ApiDoc({ summary: 'Bill payment categories', tags: ['Pay2All'] })
  p2aBbpsCategories(@Ctx() ctx: TenantCtx) {
    return this.svc.p2aBbpsCategories(ctx);
  }

  @Get('pay2all/bbps/billers')
  @TenantAccess('records.create')
  @ApiDoc({ summary: 'Billers in a bill payment category', tags: ['Pay2All'] })
  p2aBbpsBillers(@Ctx() ctx: TenantCtx, @Query('category') category: string) {
    return this.svc.p2aBbpsBillers(ctx, category ?? '');
  }

  @Get('pay2all/bbps/billers/:billerId')
  @TenantAccess('records.create')
  @ApiDoc({ summary: 'The inputs a biller needs', tags: ['Pay2All'] })
  p2aBbpsBiller(@Ctx() ctx: TenantCtx, @Param('billerId') billerId: string) {
    return this.svc.p2aBbpsBiller(ctx, billerId);
  }

  @Post('pay2all/bbps/fetch')
  @HttpCode(200)
  @TenantAccess('records.create')
  @ApiDoc({
    summary: 'Fetch the customer’s current bill (no payment)',
    tags: ['Pay2All'],
    body: pay2allBillFetchSchema,
  })
  p2aBbpsFetch(@Ctx() ctx: TenantCtx, @Body() body: unknown) {
    return this.svc.p2aBbpsFetch(ctx, parse(pay2allBillFetchSchema, body));
  }

  @Post('webhooks/pay2all/:token')
  @HttpCode(200)
  @Public()
  @ApiDoc({
    summary:
      'Pay2All status callback for one shop (unsigned by Pay2All: matched by secret URL, re-verified)',
    tags: ['Integrations'],
  })
  pay2allCallback(@Param('token') token: string, @Req() req: AppRequest, @Body() body: unknown) {
    return this.svc.handlePay2AllCallback(token, req.rawBody, body);
  }

  @Post('webhooks/:provider')
  @HttpCode(200)
  @Public()
  @ApiDoc({
    summary: 'Provider webhook receiver (signature verified on the raw body; duplicates ignored)',
    tags: ['Integrations'],
  })
  webhook(@Param('provider') provider: string, @Req() req: AppRequest) {
    return this.svc.handleWebhook(provider, req.rawBody, req.headers);
  }
}
