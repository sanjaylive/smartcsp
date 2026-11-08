import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { accountVerifySchema, connectorConfigSchema } from '@csp2all/shared';
import { Ctx, Public, TenantAccess, type AppRequest } from '../../common/access';
import type { TenantCtx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { readIdempotencyKey } from '../../common/idempotency';
import { IntegrationsService, providerExecuteSchema } from './integrations.service';

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
    summary: 'Configure the Pay2All connector (DISABLED or SIMULATOR; credentials are write-only)',
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
