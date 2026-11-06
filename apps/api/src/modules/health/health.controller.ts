import { Controller, Get, Injectable, NestMiddleware, Req, Res } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { Public } from '../../common/access';
import { Db } from '../../common/db';
import { RedisService } from '../../common/redis';
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
