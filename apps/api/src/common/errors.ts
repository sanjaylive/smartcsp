import type { ErrorCode } from '@csp2all/shared';
import type { ZodError } from 'zod';

const STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 422,
  SENSITIVE_DATA_REJECTED: 422,
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  CSRF_FAILED: 403,
  FORBIDDEN: 403,
  PERMISSION_DENIED: 403,
  MFA_REQUIRED: 403,
  TENANT_REQUIRED: 409,
  TENANT_SUSPENDED: 423,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_KEY_REUSED: 422,
  IDEMPOTENCY_IN_PROGRESS: 409,
  RATE_LIMITED: 429,
  OTP_INVALID: 400,
  OTP_EXPIRED: 400,
  OTP_ATTEMPTS_EXCEEDED: 429,
  OTP_RESEND_COOLDOWN: 429,
  SERVICE_NOT_AVAILABLE: 403,
  QUOTA_EXCEEDED: 402,
  ENTITLEMENT_REQUIRED: 402,
  INVALID_TRANSITION: 409,
  RECORD_LOCKED: 409,
  ALREADY_POSTED: 409,
  NOT_POSTED: 409,
  DAY_CLOSED: 409,
  DAY_NOT_CLOSED: 409,
  UNBALANCED_ENTRY: 500,
  AMOUNT_EXCEEDS_DUE: 422,
  LAST_OWNER: 409,
  LAST_SUPER_ADMIN: 409,
  CONNECTOR_UNAVAILABLE: 409,
  PROVIDER_OUTCOME_UNKNOWN: 202,
  FILE_REJECTED: 422,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly fields?: Record<string, string[]>,
    public readonly status: number = STATUS[code] ?? 400,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found`);
export const denied = (perm?: string) =>
  new AppError(
    'PERMISSION_DENIED',
    'You do not have permission to do this',
    perm ? { permission: perm } : undefined,
  );
export const versionConflict = () =>
  new AppError('VERSION_CONFLICT', 'This item was changed by someone else. Reload and try again.');

export function zodToAppError(err: ZodError): AppError {
  const fields: Record<string, string[]> = {};
  let sensitive = false;
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    (fields[key] ??= []).push(issue.message);
    const params = (issue as { params?: { errorCode?: string } }).params;
    if (params?.errorCode === 'SENSITIVE_DATA_REJECTED') sensitive = true;
  }
  return new AppError(
    sensitive ? 'SENSITIVE_DATA_REJECTED' : 'VALIDATION_FAILED',
    sensitive ? 'Sensitive identifiers are not accepted' : 'Validation failed',
    undefined,
    fields,
  );
}
