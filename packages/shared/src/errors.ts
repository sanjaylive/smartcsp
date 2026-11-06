/** Stable machine-readable API error codes. Clients map these to translated messages. */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'SESSION_EXPIRED',
  'CSRF_FAILED',
  'FORBIDDEN',
  'PERMISSION_DENIED',
  'MFA_REQUIRED',
  'TENANT_REQUIRED',
  'TENANT_SUSPENDED',
  'NOT_FOUND',
  'CONFLICT',
  'VERSION_CONFLICT',
  'IDEMPOTENCY_KEY_REUSED',
  'IDEMPOTENCY_IN_PROGRESS',
  'RATE_LIMITED',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'OTP_ATTEMPTS_EXCEEDED',
  'OTP_RESEND_COOLDOWN',
  'SERVICE_NOT_AVAILABLE',
  'QUOTA_EXCEEDED',
  'ENTITLEMENT_REQUIRED',
  'INVALID_TRANSITION',
  'RECORD_LOCKED',
  'ALREADY_POSTED',
  'NOT_POSTED',
  'DAY_CLOSED',
  'DAY_NOT_CLOSED',
  'UNBALANCED_ENTRY',
  'AMOUNT_EXCEEDS_DUE',
  'SENSITIVE_DATA_REJECTED',
  'LAST_OWNER',
  'LAST_SUPER_ADMIN',
  'CONNECTOR_UNAVAILABLE',
  'PROVIDER_OUTCOME_UNKNOWN',
  'FILE_REJECTED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId?: string;
    /** Field-level validation messages keyed by dotted path. */
    fields?: Record<string, string[]>;
    details?: Record<string, unknown>;
  };
}
