import 'dotenv/config';
import '../register-paths.ts';
import { createApiApp } from './bootstrap/createApp';
import { loadApiConfig } from './bootstrap/env';
import { log } from './bootstrap/logging';
import { startServer } from './runtime/server';

try {
  const config = loadApiConfig();
  const { server } = await createApiApp(config);
  startServer(server, config);
} catch (error) {
  log(error instanceof Error ? error.message : String(error), 'fatal');
  process.exit(1);
}
