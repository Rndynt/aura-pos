export function startBootstrapJobs() {
  void import('../jobs/inventorySyncRetryJob').then(({ startInventorySyncRetryJob }) => {
    startInventorySyncRetryJob();
  });
}
