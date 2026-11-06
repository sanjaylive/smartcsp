import { PrismaClient } from '@prisma/client';
import { seedReferenceData } from './reference-data';

/** Safe in every environment: inserts the service catalog and initial plans only if missing. */
async function main() {
  const db = new PrismaClient();
  await seedReferenceData(db);
  await db.$disconnect();
  // eslint-disable-next-line no-console
  console.log('Reference data is up to date.');
}
main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
