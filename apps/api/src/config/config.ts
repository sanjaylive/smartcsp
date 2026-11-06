import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/**
 * All configuration comes from the environment and is validated at startup.
 * See /.env.example for descriptions. Secrets have no defaults outside development/test.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4610),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().default('redis://127.0.0.1:56679'),
    /** Public origin(s) of the web app, comma-separated. Used for CORS and Origin checks. */
    WEB_ORIGINS: z.string().default('http://localhost:3610'),
    PUBLIC_API_URL: z.string().default('http://localhost:4610'),
    COOKIE_SECURE: bool.default(false),
    COOKIE_DOMAIN: z.string().optional(),
    TRUST_PROXY: bool.default(false),

    OTP_PEPPER: z.string().min(32),
    SECRETS_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, '32-byte hex key'),
    FILE_URL_SIGNING_KEY: z.string().min(32),
    IP_HASH_SALT: z.string().min(16),

    OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(600).default(60),
    OTP_MAX_PER_EMAIL_PER_HOUR: z.coerce.number().int().min(1).default(5),
    OTP_MAX_PER_IP_PER_HOUR: z.coerce.number().int().min(1).default(30),
    OTP_VERIFY_MAX_PER_IP_PER_10MIN: z.coerce.number().int().min(1).default(50),

    WEB_SESSION_IDLE_HOURS: z.coerce.number().default(24 * 7),
    WEB_SESSION_ABSOLUTE_DAYS: z.coerce.number().default(30),
    ADMIN_SESSION_IDLE_MINUTES: z.coerce.number().default(30),
    ADMIN_SESSION_ABSOLUTE_HOURS: z.coerce.number().default(12),
    MOBILE_ACCESS_TOKEN_MINUTES: z.coerce.number().default(15),
    MOBILE_REFRESH_DAYS: z.coerce.number().default(30),
    API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().default(600),

    EMAIL_DRIVER: z.enum(['smtp', 'memory', 'console']).default('smtp'),
    EMAIL_DELIVERY: z.enum(['inline', 'queue']).default('queue'),
    EMAIL_FROM: z.string().default('CSP2All <no-reply@csp2all.local>'),
    SMTP_HOST: z.string().default('127.0.0.1'),
    SMTP_PORT: z.coerce.number().default(56625),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_SECURE: bool.default(false),

    STORAGE_DRIVER: z.enum(['s3', 'fs']).default('s3'),
    STORAGE_FS_ROOT: z.string().default('./.storage'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('ap-south-1'),
    S3_BUCKET: z.string().default('csp2all-private'),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool.default(true),
    ATTACHMENT_MAX_BYTES: z.coerce
      .number()
      .int()
      .default(5 * 1024 * 1024),
    ATTACHMENT_SCAN_DRIVER: z.enum(['none', 'clamav']).default('none'),
    SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),

    QUEUE_DRIVER: z.enum(['bullmq', 'inline']).default('bullmq'),
    CONNECTOR_SIMULATOR_ENABLED: bool.default(false),
    SIMULATOR_WEBHOOK_SECRET: z.string().min(16).optional(),
    PROVIDER_TIMEOUT_MS: z.coerce.number().int().default(8000),

    SENTRY_DSN: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    const prodLike = c.NODE_ENV === 'production' || c.NODE_ENV === 'staging';
    if (prodLike && !c.COOKIE_SECURE)
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'must be true in production',
      });
    if (prodLike && c.EMAIL_DRIVER !== 'smtp')
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_DRIVER'],
        message: 'must be smtp in production',
      });
    if (prodLike && c.QUEUE_DRIVER !== 'bullmq')
      ctx.addIssue({
        code: 'custom',
        path: ['QUEUE_DRIVER'],
        message: 'must be bullmq in production',
      });
    if (c.NODE_ENV === 'production' && c.CONNECTOR_SIMULATOR_ENABLED)
      ctx.addIssue({
        code: 'custom',
        path: ['CONNECTOR_SIMULATOR_ENABLED'],
        message: 'the simulator cannot run in production',
      });
    if (c.CONNECTOR_SIMULATOR_ENABLED && !c.SIMULATOR_WEBHOOK_SECRET)
      ctx.addIssue({
        code: 'custom',
        path: ['SIMULATOR_WEBHOOK_SECRET'],
        message: 'required when the simulator is enabled',
      });
  });

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${msg}`);
  }
  cached = parsed.data;
  return cached;
}

export function config(): AppConfig {
  return cached ?? loadConfig();
}

export function resetConfigForTests(env: NodeJS.ProcessEnv) {
  cached = null;
  return loadConfig(env);
}
