import { Injectable } from '@nestjs/common';
import { Db } from '../../common/db';

@Injectable()
export class MeService {
  constructor(private readonly db: Db) {}

  async get(userId: string, activeTenantId: string | null) {
    return this.db.asUser(userId, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const memberships = await tx.membership.findMany({
        where: { userId, status: { in: ['ACTIVE', 'INVITED'] } },
        include: {
          tenant: { select: { id: true, name: true, status: true, district: true, state: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      const onboarding = await tx.onboardingDraft.findUnique({ where: { userId } });
      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          locale: user.locale,
        },
        activeTenantId,
        tenants: memberships.map((m) => ({
          tenantId: m.tenantId,
          name: m.tenant.name,
          role: m.role,
          status: m.status,
          tenantStatus: m.tenant.status,
          district: m.tenant.district,
          state: m.tenant.state,
        })),
        onboarding:
          onboarding && onboarding.step !== 'DONE'
            ? { step: onboarding.step }
            : memberships.length === 0
              ? { step: 'SHOP' }
              : null,
      };
    });
  }
}
