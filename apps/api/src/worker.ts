import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue, Worker } from 'bullmq';
import { loadConfig } from './config/config';
import { AppModule } from './app.module';
import { JobsService, QUEUE_NAME } from './jobs/jobs.service';
import { createPino, PinoNestLogger } from './common/logger';

/**
 * Background worker: runs queued jobs, dispatches the transactional outbox, and schedules
 * periodic jobs. Run one or more replicas; job ids and SKIP LOCKED make this safe.
 */
async function main() {
  const c = loadConfig();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new PinoNestLogger(createPino()),
  });
  const jobs = app.get(JobsService);
  const log = new Logger('Worker');
  const url = new URL(c.REDIS_URL);
  const connection = {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: Number(url.pathname.slice(1) || 0),
    password: url.password || undefined,
  };

  const worker = new Worker(
    QUEUE_NAME,
    async (job) =>
      jobs.runHandler(
        job.name,
        job.data as Record<string, unknown>,
        String(job.id),
        job.attemptsMade + 1,
      ),
    { connection, concurrency: 5 },
  );
  worker.on('failed', (job, err) => log.warn(`job ${job?.name} ${job?.id} failed: ${err.message}`));

  const queue = new Queue(QUEUE_NAME, { connection });
  await queue.upsertJobScheduler(
    'subscription-lifecycle',
    { every: 60 * 60 * 1000 },
    { name: 'subscription.lifecycle', data: {} },
  );
  await queue.upsertJobScheduler(
    'reconciliation',
    { every: 5 * 60 * 1000 },
    { name: 'reconciliation.run', data: {} },
  );
  await queue.upsertJobScheduler(
    'cleanup',
    { pattern: '30 2 * * *', tz: 'Asia/Kolkata' },
    { name: 'cleanup', data: {} },
  );
  await queue.upsertJobScheduler(
    'followups',
    { pattern: '0 8 * * *', tz: 'Asia/Kolkata' },
    { name: 'followups.notify', data: {} },
  );

  const timer = setInterval(
    () => void jobs.dispatch().catch((e) => log.warn(`dispatch: ${(e as Error).message}`)),
    2000,
  );
  log.log('worker started');

  const shutdown = async () => {
    clearInterval(timer);
    await worker.close();
    await queue.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
