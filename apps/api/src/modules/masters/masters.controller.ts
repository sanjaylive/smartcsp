import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { masterCreateSchema, masterUpdateSchema } from '@csp2all/shared';
import { Ctx, TenantAccess } from '../../common/access';
import { type TenantCtx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { MastersService } from './masters.service';

@Controller('v1/masters')
export class MastersController {
  constructor(private readonly masters: MastersService) {}

  @Get()
  @TenantAccess()
  @ApiDoc({
    summary: 'List the shop’s own expense categories, payment modes, providers and fee presets',
    tags: ['Masters'],
  })
  list(@Ctx() ctx: TenantCtx) {
    return this.masters.list(ctx);
  }

  @Post()
  @TenantAccess('settings.manage')
  @ApiDoc({
    summary: 'Add an entry to one of the shop’s lists',
    tags: ['Masters'],
    body: masterCreateSchema,
  })
  create(@Ctx() ctx: TenantCtx, @Body() body: unknown) {
    return this.masters.create(ctx, parse(masterCreateSchema, body));
  }

  @Patch(':id')
  @TenantAccess('settings.manage')
  @ApiDoc({
    summary: 'Rename, reorder, edit or turn off an entry',
    tags: ['Masters'],
    body: masterUpdateSchema,
  })
  update(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.masters.update(ctx, id, parse(masterUpdateSchema, body));
  }
}
