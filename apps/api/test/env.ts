/** Isolated test environment: own database, Redis DB index, in-memory email, inline jobs, fs storage. */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgresql://csp2all_app:app_dev_only@127.0.0.1:56632/csp2all_test',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:56679/3',
  WEB_ORIGINS: 'http://localhost:3610',
  PUBLIC_API_URL: 'http://localhost:4610',
  OTP_PEPPER: 'test-pepper-test-pepper-test-pepper-0001',
  SECRETS_ENCRYPTION_KEY: '0f'.repeat(32),
  FILE_URL_SIGNING_KEY: 'test-file-signing-key-test-file-signing',
  IP_HASH_SALT: 'test-ip-salt-0001',
  EMAIL_DRIVER: 'memory',
  EMAIL_DELIVERY: 'inline',
  QUEUE_DRIVER: 'inline',
  STORAGE_DRIVER: 'fs',
  STORAGE_FS_ROOT: process.env.STORAGE_FS_ROOT ?? mkdtempSync(join(tmpdir(), 'csp2all-test-')),
  OTP_RESEND_COOLDOWN_SECONDS: '0',
  OTP_MAX_PER_IP_PER_HOUR: '100000',
  OTP_VERIFY_MAX_PER_IP_PER_10MIN: '100000',
  OTP_MAX_PER_EMAIL_PER_HOUR: '20',
  API_RATE_LIMIT_PER_MINUTE: '1000000',
  CONNECTOR_SIMULATOR_ENABLED: 'true',
  SIMULATOR_WEBHOOK_SECRET: 'test-simulator-webhook-secret',
  PROVIDER_TIMEOUT_MS: '200',
  LOG_LEVEL: 'error',
});
