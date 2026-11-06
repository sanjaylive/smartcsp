import { loadConfig } from './config/config';
import { createApp } from './bootstrap';

async function main() {
  const c = loadConfig();
  const app = await createApp();
  await app.listen(c.PORT, '0.0.0.0');
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
