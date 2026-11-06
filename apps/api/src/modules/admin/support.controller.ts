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
import type { Permission } from '@csp2all/shared';
import { recordListQuery, supportSessionSchema } from '@csp2all/shared';
import { AdminAccess, Auth, type AppRequest, type AuthState } from '../../common/access';
import { Db, type TenantCtx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { AppError, notFound } from '../../common/errors';
import { AuditService } from '../../common/audit';
import { RecordsService } from '../records/records.service';

/** Read-only permissions available during a support session. No sensitive fields, no writes. */
const SUPPORT_PERMISSIONS: Permission[] = [
  'records.view',
  'records.view_all',
  'customers.view',
  'dues.view',
  'cashbook.view',
  'reports.operational',
  'reports.financial',
  'followups.view',
  'audit.view',
];

/**
 * Support access is never silent impersonation: an admin opens a time-limited, reasoned,
 * read-only session that the tenant can see (notification + audit history), and every read is audited.
 */
@Controller('v1/admin/support-sessions')
export class SupportController {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly records: RecordsService,
  ) {}

  @Get()
  @AdminAccess('support.access')
  @ApiDoc({ summary: 'Your support sessions', tags: ['Admin support'] })
  list(@Auth() auth: AuthState) {
    return this.db.asSystem(async (tx) => ({
      items: await tx.supportAccessSession.findMany({
        where: { adminUserId: auth.user.id },
        orderBy: { startedAt: 'desc' },
        take: 50,
      }),
    }));
  }

  @Post()
  @AdminAccess('support.access')
  @ApiDoc({
    summary: 'Open a time-limited read-only support session (tenant is notified)',
    tags: ['Admin support'],
    body: supportSessionSchema,
  })
  start(@Body() body: unknown, @Auth() auth: AuthState, @Req() req: AppRequest) {
    const dto = parse(supportSessionSchema, body);
    return this.db.asSystem(async (tx) => {
      const t = await tx.tenant.findUnique({ where: { id: dto.tenantId } });
      if (!t) throw notFound('Tenant');
      const s = await tx.supportAccessSession.create({
        data: {
          adminUserId: auth.user.id,
          tenantId: dto.tenantId,
          reason: dto.reason,
          expiresAt: new Date(Date.now() + dto.durationMinutes * 60_000),
        },
      });
      await tx.notification.create({
        data: {
          tenantId: dto.tenantId,
          type: 'SUPPORT_ACCESS',
          title: 'CSP2All support is viewing your shop',
          body: `Read-only access until ${s.expiresAt.toISOString().slice(11, 16)} UTC. Reason: ${dto.reason}`,
          link: '/app/audit',
        },
      });
      await this.audit.platform(
        tx,
        { userId: auth.user.id, actorType: 'SUPPORT', requestId: req.requestId },
        {
          tenantId: dto.tenantId,
          supportSessionId: s.id,
          action: 'support.session_started',
          targetType: 'tenant',
          targetId: dto.tenantId,
          data: { reason: dto.reason, durationMinutes: dto.durationMinutes },
        },
      );
      return s;
    });
  }

  @Post(':id/end')
  @HttpCode(200)
  @AdminAccess('support.access')
  @ApiDoc({ summary: 'End a support session', tags: ['Admin support'] })
  end(@Param('id', ParseUUIDPipe) id: string, @Auth() auth: AuthState, @Req() req: AppRequest) {
    return this.db.asSystem(async (tx) => {
      const s = await tx.supportAccessSession.findFirst({
        where: { id, adminUserId: auth.user.id, endedAt: null },
      });
      if (!s) throw notFound('Support session');
      await tx.supportAccessSession.update({
        where: { id },
        data: { endedAt: new Date(), endedBy: auth.user.id },
      });
      await this.audit.platform(
        tx,
        { userId: auth.user.id, actorType: 'SUPPORT', requestId: req.requestId },
        {
          tenantId: s.tenantId,
          supportSessionId: id,
          action: 'support.session_ended',
          targetType: 'tenant',
          targetId: s.tenantId,
        },
      );
      return { ok: true };
    });
  }

  private async ctx(
    id: string,
    auth: AuthState,
    req: AppRequest,
    action: string,
  ): Promise<TenantCtx> {
    const s = await this.db.asSystem(async (tx) => {
      const session = await tx.supportAccessSession.findFirst({
        where: { id, adminUserId: auth.user.id },
      });
      if (!session) throw notFound('Support session');
      if (session.endedAt || session.expiresAt <= new Date())
        throw new AppError('FORBIDDEN', 'This support session has ended');
      await this.audit.platform(
        tx,
        { userId: auth.user.id, actorType: 'SUPPORT', requestId: req.requestId },
        {
          tenantId: session.tenantId,
          supportSessionId: id,
          action,
          targetType: 'tenant',
          targetId: session.tenantId,
        },
      );
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: session.tenantId } });
      return { session, tenant };
    });
    return {
      tenantId: s.session.tenantId,
      userId: auth.user.id,
      membershipId: null,
      role: 'SUPPORT',
      permissions: new Set(SUPPORT_PERMISSIONS),
      timezone: s.tenant.timezone,
      requestId: req.requestId,
      actorType: 'SUPPORT',
      supportSessionId: id,
    };
  }

  @Get(':id/records')
  @AdminAccess('support.access')
  @ApiDoc({
    summary: 'Read tenant records during a support session (audited, masked)',
    tags: ['Admin support'],
    query: recordListQuery,
  })
  async listRecords(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    const ctx = await this.ctx(id, auth, req, 'support.records_listed');
    return this.records.list(ctx, parse(recordListQuery, query));
  }

  @Get(':id/records/:recordId')
  @AdminAccess('support.access')
  @ApiDoc({
    summary: 'Read one record during a support session (audited, masked)',
    tags: ['Admin support'],
  })
  async getRecord(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Auth() auth: AuthState,
    @Req() req: AppRequest,
  ) {
    const ctx = await this.ctx(id, auth, req, 'support.record_viewed');
    return this.records.get(ctx, recordId);
  }
}
