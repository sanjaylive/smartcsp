import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenantCtx, Tx } from './db';

const REDACT = /(token|secret|password|otp|code|credential|authorization|cookie|pin|cvv)/i;

/** Removes secret-looking keys from audit payloads. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[depth]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value))
      out[k] = REDACT.test(k) ? '[redacted]' : sanitize(v, depth + 1);
    return out;
  }
  if (typeof value === 'bigint') return Number(value);
  return value;
}

export interface AuditInput {
  action: string;
  targetType?: string;
  targetId?: string;
  data?: unknown;
}

@Injectable()
export class AuditService {
  /** Tenant-scoped audit (inside the caller's transaction so it commits atomically with the change). */
  async tenant(tx: Tx, ctx: TenantCtx, input: AuditInput) {
    await tx.auditEvent.create({
      data: {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        actorType: ctx.actorType,
        supportSessionId: ctx.supportSessionId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        requestId: ctx.requestId,
        ipHash: ctx.ipHash ?? null,
        data: sanitize(input.data) as Prisma.InputJsonValue,
      },
    });
  }

  async platform(
    tx: Tx,
    actor: {
      userId: string | null;
      actorType: 'ADMIN' | 'SYSTEM' | 'USER' | 'SUPPORT';
      requestId?: string;
      ipHash?: string | null;
    },
    input: AuditInput & { tenantId?: string | null; supportSessionId?: string | null },
  ) {
    await tx.auditEvent.create({
      data: {
        tenantId: input.tenantId ?? null,
        actorUserId: actor.userId,
        actorType: actor.actorType,
        supportSessionId: input.supportSessionId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        requestId: actor.requestId,
        ipHash: actor.ipHash ?? null,
        data: sanitize(input.data) as Prisma.InputJsonValue,
      },
    });
  }
}
