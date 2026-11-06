import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import IORedis from 'ioredis';
import { seedReferenceData } from '../src/cli/reference-data';

/**
 * Applies migrations to the test database (as the owner role), truncates all data, re-seeds
 * reference data, and flushes the test Redis DB. Tests then connect as the RLS-restricted app role.
 */
export default async function globalSetup() {
  const owner =
    process.env.TEST_OWNER_DATABASE_URL ??
    'postgresql://csp2all_owner:owner_dev_only@127.0.0.1:56632/csp2all_test';
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: owner },
    stdio: 'pipe',
  });
  const db = new PrismaClient({ datasources: { db: { url: owner } } });
  const tables = await db.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
  await seedReferenceData(db);
  await db.$disconnect();
  const redis = new IORedis(process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:56679/3');
  await redis.flushdb();
  await redis.quit();
}
