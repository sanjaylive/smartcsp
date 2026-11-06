import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from './db';
import { AppError } from './errors';
import { sha256 } from './crypto';

const TTL_HOURS = 24;
const STALE_IN_PROGRESS_MS = 2 * 60 * 1000;

export function readIdempotencyKey(
  headers: Record<string, unknown>,
  required = false,
): string | null {
  const key = headers['idempotency-key'];
  if (typeof key === 'string' && /^[A-Za-z0-9_.:-]{8,100}$/.test(key)) return key;
  if (key !== undefined)
    throw new AppError('VALIDATION_FAILED', 'Idempotency-Key must be 8-100 safe characters');
  if (required)
    throw new AppError(
      'VALIDATION_FAILED',
      'Idempotency-Key header is required for this operation',
    );
  return null;
}

/**
 * Stores the first response for (scope, key) and replays it for retries with the same body.
 * A different body with the same key is rejected. Failed attempts release the key.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly db: Db) {}

  async run<T>(
    scope: string,
    key: string | null,
    route: string,
    body: unknown,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!key) return fn();
    const requestHash = sha256(route + '\n' + JSON.stringify(body ?? null));
    const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);

    try {
      await this.db.idempotencyRecord.create({
        data: { scope, key, route, requestHash, expiresAt },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      const existing = await this.db.idempotencyRecord.findUnique({
        where: { scope_key: { scope, key } },
      });
      if (!existing) return this.run(scope, key, route, body, fn);
      if (existing.requestHash !== requestHash || existing.route !== route) {
        throw new AppError(
          'IDEMPOTENCY_KEY_REUSED',
          'This Idempotency-Key was already used for a different request',
        );
      }
      if (existing.status === 'COMPLETED') return existing.responseBody as T;
      if (Date.now() - existing.createdAt.getTime() < STALE_IN_PROGRESS_MS) {
        throw new AppError(
          'IDEMPOTENCY_IN_PROGRESS',
          'The original request is still being processed',
        );
      }
      // Stale in-progress claim (e.g. crashed process): take it over.
      await this.db.idempotencyRecord.update({
        where: { id: existing.id },
        data: { createdAt: new Date() },
      });
    }

    try {
      const result = await fn();
      await this.db.idempotencyRecord.update({
        where: { scope_key: { scope, key } },
        data: {
          status: 'COMPLETED',
          responseStatus: 200,
          responseBody: JSON.parse(JSON.stringify(result, bigintReplacer)),
        },
      });
      return result;
    } catch (e) {
      await this.db.idempotencyRecord
        .delete({ where: { scope_key: { scope, key } } })
        .catch(() => undefined);
      throw e;
    }
  }
}

function bigintReplacer(_k: string, v: unknown) {
  return typeof v === 'bigint' ? Number(v) : v;
}
