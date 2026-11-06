import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

/**
 * First super-admin bootstrap. No credentials are created: the person signs in with an email code
 * at /admin and must enrol TOTP before any admin API is available.
 * Refuses to run once an active super admin exists (add further admins from the portal).
 *
 *   node dist/cli/bootstrap-admin.js --email owner@yourcompany.example
 */
async function main() {
  const idx = process.argv.indexOf('--email');
  const email = z.email().parse((idx >= 0 ? process.argv[idx + 1] : '')?.trim().toLowerCase());
  const db = new PrismaClient();
  try {
    const existing = await db.platformAdmin.count({
      where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
    });
    if (existing > 0)
      throw new Error('A super admin already exists. Add more admins from the admin portal.');
    const user = await db.user.upsert({ where: { email }, create: { email }, update: {} });
    await db.platformAdmin.create({ data: { userId: user.id, role: 'SUPER_ADMIN' } });
    await db.auditEvent.create({
      data: {
        actorType: 'SYSTEM',
        action: 'admin.bootstrap',
        targetType: 'user',
        targetId: user.id,
        data: { email },
      },
    });
    // eslint-disable-next-line no-console
    console.log(
      `Super admin created for ${email}. Sign in at <web-origin>/admin and enrol an authenticator app.`,
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
