import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { paymentAccountCreateSchema, paymentAccountUpdateSchema } from '@csp2all/shared';
import { Ctx, TenantAccess } from '../../common/access';
import { type TenantCtx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { PaymentAccountsService } from './payment-accounts.service';

@Controller('v1/payment-accounts')
export class PaymentAccountsController {
  constructor(private readonly svc: PaymentAccountsService) {}

  @Get()
  @TenantAccess()
  @ApiDoc({
    summary: 'The shop’s own UPI IDs and bank accounts that customers pay into',
    tags: ['Payment accounts'],
  })
  list(@Ctx() ctx: TenantCtx) {
    return this.svc.list(ctx);
  }

  @Post()
  @TenantAccess('settings.manage')
  @ApiDoc({
    summary:
      'Add a UPI ID or bank account (upload a QR image afterwards with ownerType PAYMENT_QR)',
    tags: ['Payment accounts'],
    body: paymentAccountCreateSchema,
  })
  create(@Ctx() ctx: TenantCtx, @Body() body: unknown) {
    return this.svc.create(ctx, parse(paymentAccountCreateSchema, body));
  }

  @Patch(':id')
  @TenantAccess('settings.manage')
  @ApiDoc({
    summary: 'Edit, make default or switch off a payment account',
    tags: ['Payment accounts'],
    body: paymentAccountUpdateSchema,
  })
  update(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.svc.update(ctx, id, parse(paymentAccountUpdateSchema, body));
  }

  @Delete(':id')
  @TenantAccess('settings.manage')
  @ApiDoc({
    summary: 'Delete a payment account (switched off instead if records already use it)',
    tags: ['Payment accounts'],
  })
  remove(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(ctx, id);
  }
}
