import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { CONTROLLERS } from '../../src/app.module';
import { ACCESS_KEY, type AccessPolicy } from '../../src/common/access';
import { DOC_KEY } from '../../src/common/http';

/** Deny-by-default is also enforced at runtime; this test catches a missing policy before deploy. */
describe('route access policies', () => {
  const routes: Array<{ route: string; policy: AccessPolicy | undefined; documented: boolean }> =
    [];
  for (const ctrl of CONTROLLERS) {
    const base = String(Reflect.getMetadata(PATH_METADATA, ctrl));
    for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
      const h = (ctrl.prototype as unknown as Record<string, unknown>)[name];
      if (typeof h !== 'function' || Reflect.getMetadata(METHOD_METADATA, h) === undefined)
        continue;
      routes.push({
        route: `${ctrl.name}.${name} (${base}/${Reflect.getMetadata(PATH_METADATA, h)})`,
        policy: Reflect.getMetadata(ACCESS_KEY, h) ?? Reflect.getMetadata(ACCESS_KEY, ctrl),
        documented: !!Reflect.getMetadata(DOC_KEY, h),
      });
    }
  }

  it('finds the API surface', () => expect(routes.length).toBeGreaterThan(100));
  it('every route declares an access policy', () =>
    expect(routes.filter((r) => !r.policy).map((r) => r.route)).toEqual([]));
  it('public routes are limited to an explicit allow-list', () => {
    const pub = routes
      .filter((r) => r.policy?.type === 'public')
      .map((r) => r.route.split(' ')[0])
      .sort();
    expect(pub).toEqual(
      [
        'AdminAuthController.request',
        'AdminAuthController.verify',
        'AttachmentsController.file',
        'AuthController.csrf',
        'AuthController.refresh',
        'AuthController.requestOtp',
        'AuthController.requestPhoneOtp',
        'AuthController.verifyOtp',
        'AuthController.verifyPhoneOtp',
        'HealthController.domainResolve',
        'HealthController.health',
        'HealthController.metrics',
        'HealthController.publicConfig',
        'HealthController.ready',
        'HealthController.tlsCheck',
        'IntegrationsController.webhook',
      ].sort(),
    );
  });
  it('admin routes never accept tenant sessions and tenant routes never accept admin sessions', () => {
    for (const r of routes) {
      if (r.route.includes('v1/admin'))
        expect([r.route, r.policy?.type]).toEqual([r.route, expect.stringMatching(/admin|public/)]);
      else
        expect([r.route, r.policy?.type]).toEqual([r.route, expect.not.stringMatching(/^admin$/)]);
    }
  });
  it('every API route (except the file download link) is in the OpenAPI document', () =>
    expect(
      routes
        .filter((r) => !r.documented && !r.route.includes('AttachmentsController.file'))
        .map((r) => r.route),
    ).toEqual([]));
});
