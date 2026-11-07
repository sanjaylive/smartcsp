import { Controller, Get, Injectable, NestMiddleware, Req, Res } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { Public } from '../../common/access';
import { BRAND_DEFAULTS } from '../admin/admin.controller';
import { Db } from '../../common/db';
import { RedisService } from '../../common/redis';
import { Sms21Service } from '../messaging/sms21.service';
import { AppError } from '../../common/errors';
import { ApiDoc } from '../../common/http';

const counters = new Map<string, number>();
let durationSumMs = 0;
let durationCount = 0;

/** Minimal Prometheus-style request metrics (no labels containing user data). */
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const key = `method="${req.method}",status="${Math.floor(res.statusCode / 100)}xx"`;
      counters.set(key, (counters.get(key) ?? 0) + 1);
      durationSumMs += Number(process.hrtime.bigint() - start) / 1e6;
      durationCount++;
    });
    next();
  }
}

@Controller()
export class HealthController {
  constructor(
    private readonly db: Db,
    private readonly redis: RedisService,
    private readonly sms21: Sms21Service,
  ) {}

  @Get('health')
  @Public()
  @ApiDoc({ summary: 'Liveness probe', tags: ['Operations'] })
  health() {
    return { status: 'ok', service: 'csp2all-api' };
  }

  @Get('ready')
  @Public()
  @ApiDoc({
    summary: 'Readiness probe (database + Redis); 503 when not ready',
    tags: ['Operations'],
  })
  async ready(@Res({ passthrough: true }) res: Response) {
    const checks: Record<string, string> = {};
    try {
      await this.db.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'fail';
    }
    try {
      checks.redis = (await this.redis.ping()) ? 'ok' : 'fail';
    } catch {
      checks.redis = 'fail';
    }
    const ok = Object.values(checks).every((v) => v === 'ok');
    res.status(ok ? 200 : 503);
    return { status: ok ? 'ready' : 'not_ready', checks };
  }

  /** Public, cacheable brand + config for the web/admin apps and the landing page. */
  @Get('v1/public/config')
  @Public()
  @ApiDoc({ summary: 'Public branding and configuration', tags: ['Operations'] })
  async publicConfig() {
    return this.db.asSystem(async (tx) => {
      const rows = await tx.platformSetting.findMany({
        where: { key: { in: ['brand', 'signupsEnabled'] } },
      });
      const brand = (rows.find((r) => r.key === 'brand')?.value ?? {}) as Record<string, unknown>;
      const signups = rows.find((r) => r.key === 'signupsEnabled');
      const sms = await this.sms21.publicConfig();
      return {
        brand: {
          name: typeof brand.name === 'string' && brand.name ? brand.name : BRAND_DEFAULTS.name,
          tagline: typeof brand.tagline === 'string' ? brand.tagline : BRAND_DEFAULTS.tagline,
          supportEmail:
            typeof brand.supportEmail === 'string'
              ? brand.supportEmail
              : BRAND_DEFAULTS.supportEmail,
          supportPhone:
            typeof brand.supportPhone === 'string'
              ? brand.supportPhone
              : BRAND_DEFAULTS.supportPhone,
          primaryColor:
            typeof brand.primaryColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(brand.primaryColor)
              ? brand.primaryColor
              : BRAND_DEFAULTS.primaryColor,
          logoUrl: typeof brand.logoUrl === 'string' ? brand.logoUrl : BRAND_DEFAULTS.logoUrl,
        },
        signupsEnabled: signups ? signups.value === true : true,
        phoneSignIn: sms.configured && sms.otpEnabled,
      };
    });
  }

  /** Protect with METRICS_TOKEN and/or expose only on the internal network. */
  @Get('metrics')
  @Public()
  @ApiDoc({
    summary: 'Prometheus metrics (Bearer METRICS_TOKEN when configured; block at the public proxy)',
    tags: ['Operations'],
  })
  metrics(@Req() req: Request, @Res() res: Response) {
    const token = process.env.METRICS_TOKEN;
    if (token && req.headers.authorization !== `Bearer ${token}`)
      throw new AppError('UNAUTHENTICATED', 'Metrics token required');
    const lines = [
      '# TYPE csp2all_http_requests_total counter',
      ...[...counters].map(([k, v]) => `csp2all_http_requests_total{${k}} ${v}`),
      '# TYPE csp2all_http_request_duration_ms summary',
      `csp2all_http_request_duration_ms_sum ${durationSumMs.toFixed(1)}`,
      `csp2all_http_request_duration_ms_count ${durationCount}`,
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${process.memoryUsage().rss}`,
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${process.uptime().toFixed(0)}`,
    ];
    res.type('text/plain; version=0.0.4').send(lines.join('\n') + '\n');
  }
}
