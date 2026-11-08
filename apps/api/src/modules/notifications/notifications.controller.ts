import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { pagination } from '@csp2all/shared';
import { Ctx, TenantAccess, TenantAccessAllowSuspended } from '../../common/access';
import { Db, type TenantCtx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { notFound } from '../../common/errors';
import { pageResult, paginate } from '../../common/serialize';

const notificationsQuery = pagination.extend({
  unread: z.enum(['true', 'false']).optional(),
});

const auditQuery = pagination.extend({
  action: z.string().max(60).optional(),
  targetId: z.string().max(60).optional(),
});

@Controller('v1')
export class NotificationsController {
  constructor(private readonly db: Db) {}

  private mine(ctx: TenantCtx): Prisma.NotificationWhereInput {
    return { tenantId: ctx.tenantId, OR: [{ userId: null }, { userId: ctx.userId }] };
  }

  @Get('notifications')
  @TenantAccessAllowSuspended()
  @ApiDoc({
    summary: 'Notifications for the current user in this shop',
    tags: ['Notifications'],
    query: notificationsQuery,
  })
  list(@Ctx() ctx: TenantCtx, @Query() query: unknown) {
    const q = parse(notificationsQuery, query);
    return this.db.inTenant(ctx, async (tx) => {
      const mine = this.mine(ctx);
      const where = q.unread === 'true' ? { ...mine, readAt: null } : mine;
      const [items, total, unread] = [
        await tx.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          ...paginate(q.page, q.pageSize),
        }),
        await tx.notification.count({ where }),
        await tx.notification.count({ where: { ...mine, readAt: null } }),
      ];
      return { ...pageResult(items, total, q.page, q.pageSize), unread };
    });
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  @TenantAccessAllowSuspended()
  @ApiDoc({ summary: 'Mark a notification as read', tags: ['Notifications'] })
  read(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.inTenant(ctx, async (tx) => {
      const r = await tx.notification.updateMany({
        where: { ...this.mine(ctx), id, readAt: null },
        data: { readAt: new Date() },
      });
      if (r.count === 0 && !(await tx.notification.findFirst({ where: { ...this.mine(ctx), id } })))
        throw notFound('Notification');
      return { ok: true };
    });
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  @TenantAccessAllowSuspended()
  @ApiDoc({ summary: 'Mark all notifications as read', tags: ['Notifications'] })
  readAll(@Ctx() ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => ({
      updated: (
        await tx.notification.updateMany({
          where: { ...this.mine(ctx), readAt: null },
          data: { readAt: new Date() },
        })
      ).count,
    }));
  }

  @Get('audit')
  @TenantAccess('audit.view')
  @ApiDoc({
    summary: 'Audit history for this shop, including CSP2All support access',
    tags: ['Audit'],
    query: auditQuery,
  })
  audit(@Ctx() ctx: TenantCtx, @Query() query: unknown) {
    const q = parse(auditQuery, query);
    return this.db.inTenant(ctx, async (tx) => {
      const where: Prisma.AuditEventWhereInput = { tenantId: ctx.tenantId };
      if (q.action) where.action = { startsWith: q.action };
      if (q.targetId) where.targetId = q.targetId;
      const [items, total] = [
        await tx.auditEvent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          ...paginate(q.page, q.pageSize),
        }),
        await tx.auditEvent.count({ where }),
      ];
      const users = await tx.user.findMany({
        where: {
          id: { in: [...new Set(items.map((i) => i.actorUserId).filter((x): x is string => !!x))] },
        },
        select: { id: true, email: true, displayName: true },
      });
      return pageResult(
        items.map((i) => {
          const u = users.find((x) => x.id === i.actorUserId);
          return {
            id: i.id,
            action: i.action,
            actorType: i.actorType,
            actor: u
              ? i.actorType === 'SUPPORT'
                ? 'CSP2All support'
                : (u.displayName ?? u.email)
              : 'System',
            targetType: i.targetType,
            targetId: i.targetId,
            data: i.data,
            supportSessionId: i.supportSessionId,
            createdAt: i.createdAt,
          };
        }),
        total,
        q.page,
        q.pageSize,
      );
    });
  }
}
