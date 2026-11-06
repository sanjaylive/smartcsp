import type { ApiErrorBody, ErrorCode } from '@csp2all/shared';

/** All API calls go through the same-origin `/api` proxy (see next.config.ts). */
const BASE = '/api';
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_COOKIE = 'csp2all_csrf';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'NETWORK',
    message: string,
    public readonly fields: Record<string, string[]> = {},
    public readonly details: Record<string, unknown> = {},
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

let csrfPromise: Promise<string> | null = null;
async function ensureCsrf(force = false): Promise<string> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing && !force) return existing;
  csrfPromise ??= fetch(`${BASE}/v1/auth/csrf`, { credentials: 'same-origin', cache: 'no-store' })
    .then((r) => r.json() as Promise<{ csrfToken: string }>)
    .then((j) => readCookie(CSRF_COOKIE) ?? j.csrfToken)
    .finally(() => {
      csrfPromise = null;
    });
  return csrfPromise;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Sent on creates so retries of the same submission are de-duplicated by the API. */
  idempotencyKey?: string;
  /** Do not redirect to /login on 401 (used by auth screens). */
  noAuthRedirect?: boolean;
  signal?: AbortSignal;
}

export function buildQuery(query?: RequestOptions['query']): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function send(path: string, opts: RequestOptions, forceCsrf: boolean): Promise<Response> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (UNSAFE.has(method)) headers['X-CSRF-Token'] = await ensureCsrf(forceCsrf);
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  let body: BodyInit | undefined;
  if (opts.formData) body = opts.formData;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  return fetch(`${BASE}${path}${buildQuery(opts.query)}`, {
    method,
    headers,
    body,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: opts.signal,
  });
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await send(path, opts, false);
    if (res.status === 403 && UNSAFE.has(opts.method ?? 'GET')) {
      const peek = (await res
        .clone()
        .json()
        .catch(() => null)) as ApiErrorBody | null;
      if (peek?.error?.code === 'CSRF_FAILED') res = await send(path, opts, true);
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK', 'Network error');
  }
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  const json = (await res.json().catch(() => null)) as ApiErrorBody | null;
  const err = json?.error
    ? new ApiError(
        res.status,
        json.error.code,
        json.error.message,
        json.error.fields ?? {},
        json.error.details ?? {},
        json.error.requestId,
      )
    : new ApiError(res.status, 'INTERNAL_ERROR', `Request failed (${res.status})`);
  if (typeof window !== 'undefined' && !opts.noAuthRedirect) {
    if (err.code === 'UNAUTHENTICATED' || err.code === 'SESSION_EXPIRED') {
      const next = window.location.pathname + window.location.search;
      window.location.assign(
        `/login?next=${encodeURIComponent(next)}${err.code === 'SESSION_EXPIRED' ? '&expired=1' : ''}`,
      );
    } else if (err.code === 'TENANT_REQUIRED') {
      window.location.assign('/select-shop');
    }
  }
  throw err;
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
