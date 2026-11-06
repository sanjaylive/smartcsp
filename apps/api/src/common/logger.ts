import type { LoggerService } from '@nestjs/common';
import pino from 'pino';
import { config } from '../config/config';

/** Structured JSON logs. Secrets, cookies, tokens and OTP-bearing fields are redacted. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.code',
  '*.otp',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.credentials',
  '*.secret',
  '*.password',
];

export function createPino() {
  return pino({
    level: config().LOG_LEVEL,
    base: { service: 'csp2all-api', env: config().NODE_ENV },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export class PinoNestLogger implements LoggerService {
  constructor(private readonly p: pino.Logger) {}
  log(message: unknown, context?: string) {
    this.p.info({ context }, typeof message === 'string' ? message : JSON.stringify(message));
  }
  error(message: unknown, trace?: string, context?: string) {
    this.p.error(
      { context, trace },
      typeof message === 'string' ? message : JSON.stringify(message),
    );
  }
  warn(message: unknown, context?: string) {
    this.p.warn({ context }, typeof message === 'string' ? message : JSON.stringify(message));
  }
  debug(message: unknown, context?: string) {
    this.p.debug({ context }, typeof message === 'string' ? message : JSON.stringify(message));
  }
  verbose(message: unknown, context?: string) {
    this.p.trace({ context }, typeof message === 'string' ? message : JSON.stringify(message));
  }
}
