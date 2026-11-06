import type { ApiErrorBody, ErrorCode } from '@csp2all/shared';

/** All API calls go through the same-origin Next.js proxy (`/api/*` → API_URL). */
export const API_BASE = '/api';

const CSRF_COOKIE = 'csp2all_csrf';

export class ApiError extends Error {
  readonly code: ErrorCode | 'NETWORK_ERROR';
  readonly status: number;
  readonly requestId?: string;
  readonly fields?: Record<string, string[]>;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    body: {
      code: ErrorCode | 'NETWORK_ERROR';
      message: string;
      requestId?: string;
      fields?: Record<string, string[]>;
      details?: Record<string, unknown>;
    },
  ) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.requestId = body.requestId;
    this.fields = body.fields;
    this.details = body.details;
  }

  /** First message for a field (dotted path), if any. */
  field(name: string): string | undefined {
    return this.fields?.[name]?.[0];
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export const AUTH_ERROR_CODES = new Set(['UNAUTHENTICATED', 'SESSION_EXPIRED', 'MFA_REQUIRED']);

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

let csrfPromise: Promise<string> | null = null;

/** Double-submit CSRF token from the readable cookie, fetching a fresh one if missing. */
async function csrfToken(): Promise<string> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;
  csrfPromise ??= fetch(`${API_BASE}/v1/auth/csrf`, {
    credentials: 'same-origin',
    cache: 'no-store',
  })
    .then((r) => r.json() as Promise<{ csrfToken: string }>)
    .then((j) => readCookie(CSRF_COOKIE) ?? j.csrfToken)
    .finally(() => {
      csrfPromise = null;
    });
  return csrfPromise;
}

type Listener = (e: ApiError) => void;
const authListeners = new Set<Listener>();

/** Subscribe to session-level failures (expired, signed out, MFA required). */
export function onAuthError(fn: Listener): () => void {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Do not broadcast auth errors (used by the login flow itself). */
  silentAuth?: boolean;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {}))
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const url = `${API_BASE}${path}${qs.size ? `?${qs}` : ''}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = await csrfToken();

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, {
      code: 'NETWORK_ERROR',
      message: 'Could not reach the CSP2All API. Check your connection and try again.',
    });
  }

  const text = await res.text();
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }
  if (!res.ok) {
    const err = (json as ApiErrorBody | undefined)?.error;
    const apiErr = new ApiError(
      res.status,
      err ?? {
        code: res.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL_ERROR',
        message: `Request failed (${res.status})`,
      },
    );
    if (!opts.silentAuth && AUTH_ERROR_CODES.has(apiErr.code))
      for (const l of authListeners) l(apiErr);
    throw apiErr;
  }
  return json as T;
}

export const get = <T>(path: string, query?: RequestOptions['query']) => api<T>(path, { query });
export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body ?? {} });
export const put = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PUT', body: body ?? {} });
export const patch = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body: body ?? {} });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

/** Human-friendly message for any thrown value. */
export function errorMessage(e: unknown): string {
  if (isApiError(e)) {
    switch (e.code) {
      case 'PERMISSION_DENIED':
        return 'Your admin role does not allow this action.';
      case 'LAST_SUPER_ADMIN':
        return 'At least one active super admin must remain. Promote another admin first.';
      case 'SESSION_EXPIRED':
        return 'Your admin session expired after inactivity. Sign in again.';
      case 'CSRF_FAILED':
        return 'Security check failed. Reload the page and try again.';
      default:
        return e.message;
    }
  }
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}
