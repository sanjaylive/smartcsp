import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { z, type ZodType } from 'zod';
import { ERROR_CODES } from '@csp2all/shared';
import { ACCESS_KEY, type AccessPolicy } from '../common/access';
import { DOC_KEY, type ApiDocMeta } from '../common/http';

type Json = Record<string, unknown>;

function toSchema(schema: ZodType): Json {
  try {
    return z.toJSONSchema(schema, {
      io: 'input',
      unrepresentable: 'any',
      target: 'openapi-3.0',
    }) as Json;
  } catch {
    return { type: 'object' };
  }
}

const METHOD_NAMES: Record<number, string> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.DELETE]: 'delete',
};

/** Builds an OpenAPI 3.0 document from controller metadata and the shared Zod schemas. */
export function buildOpenApi(controllers: Array<new (...args: never[]) => unknown>): Json {
  const paths: Record<string, Json> = {};
  for (const ctrl of controllers) {
    const base = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? '');
    const classAccess = Reflect.getMetadata(ACCESS_KEY, ctrl) as AccessPolicy | undefined;
    for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
      const handler = (ctrl.prototype as Record<string, unknown>)[name];
      if (typeof handler !== 'function' || name === 'constructor') continue;
      const doc = Reflect.getMetadata(DOC_KEY, handler) as ApiDocMeta | undefined;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
      if (!doc || method === undefined) continue;
      const sub = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '');
      const path = ('/' + [base, sub].filter((p) => p && p !== '/').join('/'))
        .replace(/\/+/g, '/')
        .replace(/:(\w+)/g, '{$1}');
      const access =
        (Reflect.getMetadata(ACCESS_KEY, handler) as AccessPolicy | undefined) ?? classAccess;

      const op: Json = {
        summary: doc.summary,
        description: doc.description,
        tags: doc.tags,
        operationId: `${ctrl.name.replace(/Controller$/, '')}_${name}`,
        parameters: [] as Json[],
        responses: {
          '200': {
            description: 'Success',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          '4XX': {
            description: 'Error with stable code',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      };
      const params = op.parameters as Json[];
      for (const m of path.matchAll(/\{(\w+)\}/g))
        params.push({ name: m[1], in: 'path', required: true, schema: { type: 'string' } });
      if (doc.query) {
        const qs = toSchema(doc.query) as {
          properties?: Record<string, Json>;
          required?: string[];
        };
        for (const [k, s] of Object.entries(qs.properties ?? {}))
          params.push({
            name: k,
            in: 'query',
            required: qs.required?.includes(k) ?? false,
            schema: s,
          });
      }
      if (doc.idempotent)
        params.push({
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          schema: { type: 'string', minLength: 8, maxLength: 100 },
          description: 'Retries with the same key and body return the original response.',
        });
      params.push({
        name: 'X-Request-Id',
        in: 'header',
        required: false,
        schema: { type: 'string' },
      });
      if (doc.body) {
        op.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: toSchema(doc.body),
              ...(doc.example ? { example: doc.example } : {}),
            },
          },
        };
      }
      if (access?.type === 'public') op.security = [];
      else if (access?.type === 'admin') op.security = [{ adminCookie: [], csrfHeader: [] }];
      else op.security = [{ sessionCookie: [], csrfHeader: [] }, { bearerAuth: [] }];
      if (access?.type === 'tenant') op['x-permissions'] = access.permissions;
      if (access?.type === 'admin') op['x-platform-permissions'] = access.permissions;
      (paths[path] ??= {})[METHOD_NAMES[method]] = op;
    }
  }
  return {
    openapi: '3.0.3',
    info: {
      title: 'CSP2All API',
      version: '1.0.0',
      description:
        'Record-first API for CSP shops. Money is integer paise (fields end in `Paise`). Business dates are `YYYY-MM-DD` in the shop timezone; instants are ISO-8601 UTC. Errors use stable `error.code` values. Manual records are operator-reported and never trigger provider execution.',
    },
    servers: [{ url: '/' }],
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'csp2all_sid' },
        adminCookie: { type: 'apiKey', in: 'cookie', name: 'csp2all_asid' },
        csrfHeader: {
          type: 'apiKey',
          in: 'header',
          name: 'X-CSRF-Token',
          description:
            'Required on unsafe methods with cookie auth; must equal the csp2all_csrf cookie.',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Mobile access token (15 min); rotate with /v1/auth/refresh.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', enum: [...ERROR_CODES] },
                message: { type: 'string' },
                requestId: { type: 'string' },
                fields: {
                  type: 'object',
                  additionalProperties: { type: 'array', items: { type: 'string' } },
                },
                details: { type: 'object' },
              },
            },
          },
          example: {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Validation failed',
              requestId: '0b7c…',
              fields: { principalPaise: ['Must be whole paise'] },
            },
          },
        },
      },
    },
  };
}
