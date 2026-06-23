import type { Server } from 'http';
import type { ApiConfig } from '../bootstrap/env';
import { log } from '../bootstrap/logging';
import { runMigrationAsync } from '../bootstrap/migrations';

export function startServer(server: Server, config: Pick<ApiConfig, 'port'>) {
  server.listen({
    port: config.port,
    host: '0.0.0.0',
    reusePort: true,
  }, () => {
    log(`serving on port ${config.port}`);
    void runMigrationAsync();
  });

  return server;
}
