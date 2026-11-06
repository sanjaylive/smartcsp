import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  effectivePermissions,
  GRANTABLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  staffInviteSchema,
  staffUpdateSchema,
  TENANT_ROLES,
  type TenantRole,
} from '@csp2all/shared';
import { Ctx, TenantAccess } from '../../common/access';
import { Db, type TenantCtx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { AppError, notFound, versionConflict } from '../../common/errors';
import { AuditService } from '../../common/audit';
import { config } from '../../config/config';
import { EmailService } from '../email/email.service';
import { EntitlementsService } from '../subscription/entitlements.service';
import { normalizeEmail } from '../auth/otp.service';

function assertGrantable(list: string[], field: string) {
  const bad = list.filter((p) => !(GRANTABLE_PERMISSIONS as string[]).includes(p));
  if (bad.length)
    throw new AppError(
      'PERMISSION_DENIED',
      'These permissions can only belong to the owner',
      { permissions: bad },
      { [field]: [`Not grantable: ${bad.join(', ')}`] },
    );
}

@Controller('v1')
export class StaffController {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get('roles')
  @TenantAccess('staff.view')
  @ApiDoc({
    summary: 'Role defaults and grantable permissions (permission matrix)',
    tags: ['Staff'],
  })
  roles() {
    return {
      permissions: PERMISSIONS,
      roles: TENANT_ROLES.map((r) => ({ role: r, permissions: ROLE_DEFAULT_PERMISSIONS[r] })),
      grantable: GRANTABLE_PERMISSIONS,
    };
  }

  @Get('staff')
  @TenantAccess('staff.view')
  @ApiDoc({ summary: 'Staff members and their effective permissions', tags: ['Staff'] })
  list(@Ctx() ctx: TenantCtx) {
    return this.db.inTenant(ctx, async (tx) => {
      const ms = await tx.membership.findMany({
        where: { tenantId: ctx.tenantId },
        include: { user: { select: { email: true, displayName: true, lastLoginAt: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return {
        items: ms.map((m) => ({
          id: m.id,
          userId: m.userId,
          email: m.user.email,
          displayName: m.displayName ?? m.user.displayName,
          role: m.role,
          status: m.status,
          grants: m.grants,
          revokes: m.revokes,
          permissions: [...effectivePermissions(m.role as TenantRole, m.grants, m.revokes)].sort(),
          lastLoginAt: m.user.lastLoginAt,
          isSelf: m.userId === ctx.userId,
          version: m.version,
        })),
      };
    });
  }

  @Post('staff/invite')
  @TenantAccess('staff.manage')
  @ApiDoc({
    summary: 'Invite a staff member by email (counts toward the plan staff limit)',
    tags: ['Staff'],
    body: staffInviteSchema,
  })
  invite(@Ctx() ctx: TenantCtx, @Body() body: unknown) {
    const dto = parse(staffInviteSchema, body);
    assertGrantable(dto.grants, 'grants');
    const email = normalizeEmail(dto.email);
    return this.db.inTenant(ctx, async (tx) => {
      await this.entitlements.assertStaffCapacity(tx, ctx.tenantId);
      const user = await tx.user.upsert({
        where: { email },
        create: { email, displayName: dto.displayName },
        update: {},
      });
      const existing = await tx.membership.findUnique({
        where: { tenantId_userId: { tenantId: ctx.tenantId, userId: user.id } },
      });
      if (existing && existing.status !== 'DISABLED')
        throw new AppError('CONFLICT', 'This person is already on your staff');
      const data = {
        role: dto.role,
        status: 'INVITED',
        displayName: dto.displayName,
        grants: dto.grants,
        revokes: dto.revokes,
        invitedByUserId: ctx.userId,
      };
      const m = existing
        ? await tx.membership.update({
            where: { id: existing.id },
            data: { ...data, version: { increment: 1 } },
          })
        : await tx.membership.create({
            data: { ...data, tenantId: ctx.tenantId, userId: user.id },
          });
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
      await this.email.sendInTx(
        tx,
        this.email.simple(
          email,
          'staff_invite',
          `You're invited to ${tenant.name} on CSP2All`,
          `${tenant.ownerDisplayName} invited you to join ${tenant.name} as ${dto.role.toLowerCase()}. Sign in with this email address at ${config().WEB_ORIGINS.split(',')[0]}/login to accept.`,
        ),
        ctx.tenantId,
      );
      await this.audit.tenant(tx, ctx, {
        action: 'staff.invited',
        targetType: 'membership',
        targetId: m.id,
        data: { role: dto.role, grants: dto.grants, revokes: dto.revokes },
      });
      return {
        id: m.id,
        userId: user.id,
        email,
        role: m.role,
        status: m.status,
        version: m.version,
      };
    });
  }

  @Patch('staff/:id')
  @TenantAccess('staff.manage')
  @ApiDoc({
    summary: "Change a member's role, permission overrides or status",
    tags: ['Staff'],
    body: staffUpdateSchema,
  })
  update(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const dto = parse(staffUpdateSchema, body);
    if (dto.grants) assertGrantable(dto.grants, 'grants');
    return this.db.inTenant(ctx, async (tx) => {
      const m = await tx.membership.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!m) throw notFound('Staff member');
      if (m.userId === ctx.userId)
        throw new AppError('FORBIDDEN', 'You cannot change your own access');
      if (m.role === 'OWNER')
        throw new AppError('LAST_OWNER', 'The owner role cannot be changed here');
      if (dto.status === 'ACTIVE' && m.status === 'DISABLED')
        await this.entitlements.assertStaffCapacity(tx, ctx.tenantId);
      const res = await tx.membership.updateMany({
        where: { id, tenantId: ctx.tenantId, version: dto.version },
        data: {
          role: dto.role,
          grants: dto.grants,
          revokes: dto.revokes,
          status: dto.status === 'ACTIVE' && m.status === 'DISABLED' ? 'INVITED' : dto.status,
          version: { increment: 1 },
        },
      });
      if (res.count !== 1) throw versionConflict();
      await this.audit.tenant(tx, ctx, {
        action: 'staff.updated',
        targetType: 'membership',
        targetId: id,
        data: { ...dto, previousRole: m.role },
      });
      const u = await tx.membership.findUniqueOrThrow({ where: { id } });
      return {
        id: u.id,
        role: u.role,
        status: u.status,
        grants: u.grants,
        revokes: u.revokes,
        permissions: [...effectivePermissions(u.role as TenantRole, u.grants, u.revokes)].sort(),
        version: u.version,
      };
    });
  }
}
