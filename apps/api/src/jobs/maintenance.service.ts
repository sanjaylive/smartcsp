import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { localDate } from '@csp2all/shared';
import { Db } from '../common/db';
import { toDate } from '../common/serialize';
import { StorageService } from '../modules/storage/storage.service';
import { JobsService } from './jobs.service';

const DEFAULT_RETENTION = { otpChallengeDays: 7, revokedSessionDays: 30, exportFileHours: 24 };

/** Periodic housekeeping. Every step is idempotent and tenant-safe. */
@Injectable()
export class MaintenanceService implements OnModuleInit {
  private readonly log = new Logger('Maintenance');

  constructor(
    private readonly db: Db,
    private readonly jobs: JobsService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit() {
    this.jobs.register('cleanup', () => this.cleanup().then(() => undefined));
    this.jobs.register('followups.notify', () => this.notifyFollowUps().then(() => undefined));
  }

  private async retention() {
    const s = await this.db.platformSetting.findUnique({ where: { key: 'dataRetention' } });
    return { ...DEFAULT_RETENTION, ...((s?.value as object) ?? {}) } as typeof DEFAULT_RETENTION;
  }

  async cleanup(now = new Date()) {
    const r = await this.retention();
    const day = 86_400_000;
    const otp = await this.db.otpChallenge.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - r.otpChallengeDays * day) } },
    });
    const idem = await this.db.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: now } } });
    const sessions = await this.db.session.deleteMany({
      where: {
        OR: [
          { revokedAt: { lt: new Date(now.getTime() - r.revokedSessionDays * day) } },
          { absoluteExpires: { lt: new Date(now.getTime() - r.revokedSessionDays * day) } },
        ],
      },
    });
    const outbox = await this.db.asSystem((tx) =>
      tx.outboxEvent.deleteMany({
        where: { status: 'DISPATCHED', dispatchedAt: { lt: new Date(now.getTime() - 7 * day) } },
      }),
    );
    const expired = await this.db.asSystem((tx) =>
      tx.exportJob.findMany({ where: { status: 'READY', expiresAt: { lt: now } }, take: 500 }),
    );
    for (const e of expired) {
      if (e.storageKey)
        await this.storage
          .delete(e.storageKey)
          .catch((err) => this.log.warn(`export delete failed: ${(err as Error).message}`));
      await this.db.asSystem((tx) =>
        tx.exportJob.update({ where: { id: e.id }, data: { status: 'EXPIRED', storageKey: null } }),
      );
    }
    const result = {
      otp: otp.count,
      idempotency: idem.count,
      sessions: sessions.count,
      outbox: outbox.count,
      exports: expired.length,
    };
    this.log.log(`cleanup ${JSON.stringify(result)}`);
    return result;
  }

  /** One "follow-ups due today" notification per tenant per day. */
  async notifyFollowUps(now = new Date()) {
    const tenants = await this.db.asSystem((tx) =>
      tx.tenant.findMany({ where: { status: 'ACTIVE' }, select: { id: true, timezone: true } }),
    );
    let created = 0;
    for (const t of tenants) {
      const today = localDate(now, t.timezone);
      await this.db.inTenant(
        { tenantId: t.id, userId: '00000000-0000-0000-0000-000000000000' },
        async (tx) => {
          const due = await tx.followUpTask.count({
            where: { tenantId: t.id, status: 'OPEN', dueDate: { lte: toDate(today) } },
          });
          if (!due) return;
          const exists = await tx.notification.findFirst({
            where: { tenantId: t.id, type: 'FOLLOWUPS_DUE', link: `/app/follow-ups?date=${today}` },
          });
          if (exists) return;
          await tx.notification.create({
            data: {
              tenantId: t.id,
              type: 'FOLLOWUPS_DUE',
              title: `${due} follow-up${due > 1 ? 's' : ''} due`,
              body: 'Open your follow-ups list to call or update customers.',
              link: `/app/follow-ups?date=${today}`,
            },
          });
          created++;
        },
      );
    }
    return { created };
  }
}
