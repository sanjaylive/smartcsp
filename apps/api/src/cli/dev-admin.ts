import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { loadConfig } from '../config/config';
import { encryptSecret } from '../common/crypto';

/**
 * DEVELOPMENT/TEST ONLY: creates (or resets) a platform admin with a pre-enrolled TOTP secret so
 * automated tests can complete admin MFA. Refuses to run in staging or production.
 *
 *   node dist/cli/dev-admin.js --email admin@example.test --totp-secret JBSWY3DPEHPK3PXP
 */
async function main() {
  const c = loadConfig();
  if (c.NODE_ENV !== 'development' && c.NODE_ENV !== 'test')
    throw new Error('dev-admin is disabled outside development/test');
  const arg = (n: string) => {
    const i = process.argv.indexOf(n);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const email = z.email().parse(arg('--email')?.toLowerCase());
  const secret = z
    .string()
    .regex(/^[A-Z2-7]{16,64}$/)
    .parse(arg('--totp-secret'));
  const role = z.enum(['SUPER_ADMIN', 'SUPPORT']).parse(arg('--role') ?? 'SUPER_ADMIN');
  const db = new PrismaClient();
  const user = await db.user.upsert({
    where: { email },
    create: { email, displayName: 'Dev Admin' },
    update: { status: 'ACTIVE' },
  });
  await db.platformAdmin.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      role,
      totpSecretEnc: encryptSecret(secret),
      totpEnabledAt: new Date(),
    },
    update: {
      role,
      status: 'ACTIVE',
      totpSecretEnc: encryptSecret(secret),
      totpEnabledAt: new Date(),
      totpLastStep: null,
    },
  });
  await db.$disconnect();
  // eslint-disable-next-line no-console
  console.log(`Dev admin ready: ${email} (${role}). TOTP secret ${secret}`);
}
main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
