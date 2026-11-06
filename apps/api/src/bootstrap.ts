import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { absolutePath as swaggerAssets } from 'swagger-ui-dist';
import express from 'express';
import { AppModule, CONTROLLERS } from './app.module';
import { config } from './config/config';
import { ErrorFilter, JsonSafeInterceptor } from './common/http';
import { allowedOrigins } from './common/security.guard';
import { createPino, PinoNestLogger } from './common/logger';
import { buildOpenApi } from './openapi/openapi';

/** Creates the configured HTTP application (shared by main.ts and integration tests). */
export async function createApp(opts: { logger?: boolean } = {}) {
  const c = config();
  const log = createPino();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: opts.logger === false ? false : new PinoNestLogger(log),
  });
  app.set('trust proxy', c.TRUST_PROXY ? 1 : false);
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '256kb' });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: c.COOKIE_SECURE ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );
  app.use(cookieParser());
  if (opts.logger !== false) {
    app.use(
      pinoHttp({
        logger: log,
        genReqId: (req) => (req as unknown as { requestId?: string }).requestId ?? randomUUID(),
        customProps: (req) => ({ requestId: (req as unknown as { requestId?: string }).requestId }),
        serializers: {
          req: (r: { method: string; url: string }) => ({
            method: r.method,
            url: r.url.replace(/\/files\/[^/?]+/, '/files/[token]'),
          }),
        },
      }),
    );
  }
  app.enableCors({
    origin: allowedOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'Idempotency-Key',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
  });
  app.useGlobalFilters(new ErrorFilter());
  app.useGlobalInterceptors(new JsonSafeInterceptor());
  app.enableShutdownHooks();

  if (process.env.API_DOCS_ENABLED !== 'false') {
    const doc = buildOpenApi(CONTROLLERS as never);
    const http = app.getHttpAdapter().getInstance() as express.Express;
    http.get('/openapi.json', (_req, res) => res.json(doc));
    http.use('/docs/assets', express.static(swaggerAssets(), { index: false }));
    http.get('/docs/init.js', (_req, res) =>
      res
        .type('application/javascript')
        .send(
          "window.ui = SwaggerUIBundle({ url: '/openapi.json', dom_id: '#ui', deepLinking: true });",
        ),
    );
    http.get('/docs', (_req, res) =>
      res
        .type('html')
        .send(
          '<!doctype html><html><head><title>CSP2All API</title><link rel="stylesheet" href="/docs/assets/swagger-ui.css"></head><body><div id="ui"></div><script src="/docs/assets/swagger-ui-bundle.js"></script><script src="/docs/init.js"></script></body></html>',
        ),
    );
  }
  return app;
}
