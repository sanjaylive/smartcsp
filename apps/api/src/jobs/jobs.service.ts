import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { config } from '../config/config';
import { Db, type Tx } from '../common/db';

export const QUEUE_NAME = 'csp2all-jobs';

export type JobType =
  | 'email.send'
  | 'export.generate'
  | 'attachment.scan'
  | 'reconciliation.run'
  | 'subscription.lifecycle'
  | 'followups.notify'
  | 'cleanup';

export type JobHandler = (
  payload: Record<string, unknown>,
  meta: { jobId: string; attempt: number },
) => Promise<void>;

/**
 * Durable job handoff:
 *   1. `enqueue(tx, …)` writes an OutboxEvent inside the business transaction.
 *   2. The dispatcher moves pending events to BullMQ (jobId = outbox id ⇒ deduplicated).
 *   3. Workers run handlers; handlers must be idempotent and re-check tenant scope.
 * The `inline` driver (tests) runs handlers in-process on `drain()`.
 */
@Injectable()
export class JobsService implements OnModuleDestroy {
  private readonly log = new Logger('Jobs');
  private readonly handlers = new Map<JobType, JobHandler>();
  private queue: Queue | null = null;
  private dispatching: Promise<void> | null = null;

  constructor(private readonly db: Db) {}

  private getQueue(): Queue {
    if (!this.queue) {
      const url = new URL(config().REDIS_URL);
      this.queue = new Queue(QUEUE_NAME, {
        connection: {
          host: url.hostname,
          port: Number(url.port || 6379),
          db: Number(url.pathname.slice(1) || 0),
          password: url.password || undefined,
        },
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { age: 7 * 86400 },
        },
      });
    }
    return this.queue;
  }

  register(type: JobType, handler: JobHandler) {
    this.handlers.set(type, handler);
  }

  handler(type: string): JobHandler | undefined {
    return this.handlers.get(type as JobType);
  }

  async enqueue(
    tx: Tx,
    type: JobType,
    payload: Record<string, unknown>,
    opts: { tenantId?: string | null; dedupeKey?: string; delayMs?: number } = {},
  ) {
    await tx.outboxEvent.create({
      data: {
        tenantId: opts.tenantId ?? null,
        type,
        payload: payload as Prisma.InputJsonValue,
        dedupeKey: opts.dedupeKey,
        availableAt: new Date(Date.now() + (opts.delayMs ?? 0)),
      },
    });
  }

  /** Direct enqueue for transient jobs that must not be persisted in Postgres (e.g. OTP email). */
  async enqueueTransient(type: JobType, payload: Record<string, unknown>, jobId: string) {
    if (config().QUEUE_DRIVER === 'inline') {
      await this.runHandler(type, payload, jobId, 1);
      return;
    }
    await this.getQueue().add(type, payload, {
      jobId,
      removeOnComplete: true,
      removeOnFail: { age: 3600 },
    });
  }

  /** Called after a business transaction commits; safe to call often. */
  kick() {
    if (config().QUEUE_DRIVER === 'inline') return; // tests call drain() explicitly
    void this.dispatch().catch((e) => this.log.warn(`dispatch failed: ${(e as Error).message}`));
  }

  dispatch(): Promise<void> {
    if (!this.dispatching) {
      this.dispatching = this.dispatchBatch().finally(() => (this.dispatching = null));
    }
    return this.dispatching;
  }

  /** Inline driver: run all pending events now (tests and one-off CLI usage). */
  async drain(max = 100) {
    for (let i = 0; i < max; i++) {
      const before = await this.db.asSystem((tx) =>
        tx.outboxEvent.count({ where: { status: 'PENDING', availableAt: { lte: new Date() } } }),
      );
      if (before === 0) return;
      await this.dispatchBatch();
    }
  }

  private async dispatchBatch() {
    const rows = await this.db.asSystem(
      (tx) =>
        tx.$queryRaw<
          { id: string; type: string; payload: Record<string, unknown>; attempts: number }[]
        >`
        UPDATE outbox_events SET status = 'DISPATCHING', attempts = attempts + 1
        WHERE id IN (SELECT id FROM outbox_events WHERE status = 'PENDING' AND "availableAt" <= now()
                     ORDER BY "createdAt" LIMIT 50 FOR UPDATE SKIP LOCKED)
        RETURNING id, type, payload, attempts`,
    );
    for (const row of rows) {
      try {
        if (config().QUEUE_DRIVER === 'inline')
          await this.runHandler(row.type, row.payload, row.id, row.attempts);
        else await this.getQueue().add(row.type, row.payload, { jobId: row.id });
        await this.db.asSystem((tx) =>
          tx.outboxEvent.update({
            where: { id: row.id },
            data: { status: 'DISPATCHED', dispatchedAt: new Date(), lastError: null },
          }),
        );
      } catch (e) {
        const failed = row.attempts >= 5;
        await this.db.asSystem((tx) =>
          tx.outboxEvent.update({
            where: { id: row.id },
            data: {
              status: failed ? 'FAILED' : 'PENDING',
              lastError: (e as Error).message.slice(0, 500),
              availableAt: new Date(Date.now() + 2 ** row.attempts * 1000),
            },
          }),
        );
      }
    }
  }

  async runHandler(type: string, payload: Record<string, unknown>, jobId: string, attempt: number) {
    const h = this.handlers.get(type as JobType);
    if (!h) throw new Error(`No handler for job ${type}`);
    await h(payload, { jobId, attempt });
  }

  async failedJobs(limit = 50) {
    if (config().QUEUE_DRIVER === 'inline') return [];
    const jobs = await this.getQueue().getFailed(0, limit - 1);
    return jobs.map((j) => ({
      id: j.id,
      name: j.name,
      failedReason: j.failedReason?.slice(0, 300),
      attemptsMade: j.attemptsMade,
      timestamp: new Date(j.timestamp).toISOString(),
      tenantId: typeof j.data?.tenantId === 'string' ? j.data.tenantId : null,
    }));
  }

  async retryJob(id: string) {
    const job = await this.getQueue().getJob(id);
    if (job) await job.retry();
  }

  async queueCounts() {
    if (config().QUEUE_DRIVER === 'inline') return {};
    return this.getQueue().getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  }

  async onModuleDestroy() {
    await this.queue?.close().catch(() => undefined);
  }
}
