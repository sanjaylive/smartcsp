import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ParseUUIDPipe } from '@nestjs/common';
import { z } from 'zod';
import { Ctx, TenantAccess } from '../../common/access';
import { type TenantCtx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { AuditService } from '../../common/audit';
import { Db } from '../../common/db';
import { DomainsService } from './domains.service';

const addSchema = z.object({ domain: z.string().trim().min(3).max(253) });

@Controller('v1/tenant/domains')
export class DomainsController {
  constructor(
    private readonly domains: DomainsService,
    private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @TenantAccess('settings.manage')
  @ApiDoc({ summary: 'List the shop’s custom domains', tags: ['Domains'] })
  list(@Ctx() ctx: TenantCtx) {
    return this.domains.list(ctx);
  }

  @Post()
  @TenantAccess('settings.manage')
  @ApiDoc({ summary: 'Add a custom domain (returns the DNS records to set)', tags: ['Domains'] })
  async add(@Ctx() ctx: TenantCtx, @Body() body: unknown) {
    const dto = parse(addSchema, body);
    const view = await this.domains.add(ctx, dto.domain);
    await this.db.inTenant(ctx, (tx) =>
      this.audit.tenant(tx, ctx, {
        action: 'domain.added',
        targetType: 'domain',
        targetId: view.id,
        data: { domain: view.domain },
      }),
    );
    return view;
  }

  @Post(':id/verify')
  @HttpCode(200)
  @TenantAccess('settings.manage')
  @ApiDoc({
    summary: 'Check the verification TXT record and activate the domain',
    tags: ['Domains'],
  })
  verify(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.domains.verify(ctx, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @TenantAccess('settings.manage')
  @ApiDoc({ summary: 'Remove a custom domain', tags: ['Domains'] })
  async remove(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string) {
    await this.domains.remove(ctx, id);
    await this.db.inTenant(ctx, (tx) =>
      this.audit.tenant(tx, ctx, { action: 'domain.removed', targetType: 'domain', targetId: id }),
    );
  }
}
