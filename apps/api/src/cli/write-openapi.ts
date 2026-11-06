import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONTROLLERS } from '../app.module';
import { buildOpenApi } from '../openapi/openapi';

/** Writes docs/openapi.json from controller metadata (no database or network needed). */
const out = resolve(__dirname, '../../../../docs/openapi.json');
writeFileSync(out, JSON.stringify(buildOpenApi(CONTROLLERS as never), null, 2) + '\n');
// eslint-disable-next-line no-console
console.log(`OpenAPI written to ${out}`);
