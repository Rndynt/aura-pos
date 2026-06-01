/**
 * Cluster mode — utilizes all available CPU cores.
 * Primary process forks workers; each worker runs the full Express server.
 * reusePort: true allows the OS to distribute connections across workers.
 */
import cluster from 'node:cluster';
import os from 'node:os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const isPrimary = cluster.isPrimary ?? cluster.isMaster;

// Only enable cluster in production with multiple cores available
const enableCluster = process.env.NODE_ENV === 'production'
  && !process.env.DISABLE_CLUSTER
  && os.cpus().length > 1;

if (enableCluster && isPrimary) {
  const numWorkers = parseInt(process.env.CLUSTER_WORKERS || '', 10) || os.cpus().length;
  console.log(`[cluster] Primary ${process.pid} forking ${numWorkers} workers`);

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code) => {
    console.warn(`[cluster] Worker ${worker.process.pid} exited (code=${code}). Restarting...`);
    cluster.fork();
  });
} else {
  // Worker or single-core mode — run the actual server
  await import('./index.js');
}
