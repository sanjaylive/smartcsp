import {
  ArgumentsHost,
  CallHandler,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
  NestMiddleware,
  SetMetadata,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { NextFunction, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { map, type Observable } from 'rxjs';
import { ZodError, type ZodType } from 'zod';
import type { ApiErrorBody, ErrorCode } from '@csp2all/shared';
import type { AppRequest } from './access';
import { AppError, zodToAppError } from './errors';
import { jsonSafe } from './serialize';

/** Validate untrusted input against a shared Zod schema; throws VALIDATION_FAILED with field messages. */
export function parse<T extends ZodType>(schema: T, input: unknown): import('zod').infer<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw zodToAppError(r.error);
  return r.data;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: AppRequest, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];
    req.requestId =
      typeof incoming === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(incoming)
        ? incoming
        : randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  }
}

@Injectable()
export class JsonSafeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((body) => jsonSafe(body)));
  }
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly log = new Logger('ErrorFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<AppRequest>();
    const err = this.toAppError(exception);
    if (err.status >= 500) {
      // Never log request bodies or secrets; the error message/stack is enough to debug.
      this.log.error({
        requestId: req.requestId,
        path: req.path,
        code: err.code,
        err: exception instanceof Error ? exception.message : String(exception),
      });
    }
    const body: ApiErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        requestId: req.requestId,
        ...(err.fields ? { fields: err.fields } : {}),
        ...(err.details ? { details: err.details } : {}),
      },
    };
    if (err.code === 'RATE_LIMITED' || err.code === 'OTP_RESEND_COOLDOWN') {
      const retry = err.details?.retryAfterSeconds;
      if (typeof retry === 'number') res.setHeader('Retry-After', String(Math.max(1, retry)));
    }
    res.status(err.status).json(body);
  }

  private toAppError(e: unknown): AppError {
    if (e instanceof AppError) return e;
    if (e instanceof ZodError) return zodToAppError(e);
    const msg = e instanceof Error ? e.message : '';
    // Database-level guards raised by triggers (see migration rls_and_integrity).
    if (msg.includes('DAY_CLOSED'))
      return new AppError('DAY_CLOSED', 'This business day is closed. Reopen it to make changes.');
    if (msg.includes('UNBALANCED_ENTRY'))
      return new AppError('UNBALANCED_ENTRY', 'Ledger entry did not balance');
    if (msg.includes('IMMUTABLE_ROW'))
      return new AppError('RECORD_LOCKED', 'Posted history cannot be changed');
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002')
        return new AppError('CONFLICT', 'A conflicting item already exists', {
          target: e.meta?.target as unknown,
        });
      if (e.code === 'P2025') return new AppError('NOT_FOUND', 'Not found');
      if (e.code === 'P2003')
        return new AppError('VALIDATION_FAILED', 'A referenced item does not exist in this shop');
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const code: ErrorCode =
        status === 404
          ? 'NOT_FOUND'
          : status === 413
            ? 'FILE_REJECTED'
            : status === 429
              ? 'RATE_LIMITED'
              : status < 500
                ? 'VALIDATION_FAILED'
                : 'INTERNAL_ERROR';
      return new AppError(
        code,
        status === 404 ? 'Not found' : e.message,
        undefined,
        undefined,
        status,
      );
    }
    return new AppError('INTERNAL_ERROR', 'Something went wrong');
  }
}

// ---------------------------------------------------------------------------- OpenAPI metadata

export const DOC_KEY = 'csp2all:doc';
export interface ApiDocMeta {
  summary: string;
  tags?: string[];
  body?: ZodType;
  query?: ZodType;
  idempotent?: boolean;
  example?: unknown;
  description?: string;
}
export const ApiDoc = (meta: ApiDocMeta) => SetMetadata(DOC_KEY, meta);
