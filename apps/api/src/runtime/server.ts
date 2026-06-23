import type { Server } from 'http';
import type { ApiConfig } from '../bootstrap/env';
import { log } from '../bootstrap/logging';
import { handleBootMigrationPolicy } from '../bootstrap/migrations';

export function startServer(server: Server, config: Pick<ApiConfig, 'port' | 'isProduction' | 'autoMigrateOnBoot'>) {
  server.listen({
    port: config.port,
    host: '0.0.0.0',
    reusePort: true,
  }, () => {
    log(`serving on port ${config.port}`);
    handleBootMigrationPolicy(config);
  });

  return server;
}
