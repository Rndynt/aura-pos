import { nanoid } from "nanoid";
import { offlineDb } from "./db";
import type { LocalPrintJob } from "./types";

export type EnqueuePrintJobInput = {
  tenantId: string;
  terminalId: string;
  localOrderId?: string;
  serverOrderId?: string;
  orderNumber?: string;
  type: "receipt" | "kitchen";
  payload: unknown;
};

export async function enqueuePrintJob(input: EnqueuePrintJobInput): Promise<LocalPrintJob> {
  const now = new Date().toISOString();
  const job: LocalPrintJob = {
    id: nanoid(),
    tenantId: input.tenantId,
    terminalId: input.terminalId,
    localOrderId: input.localOrderId,
    serverOrderId: input.serverOrderId,
    orderNumber: input.orderNumber,
    type: input.type,
    payload: input.payload,
    syncStatus: "local_only",
    status: "pending",
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await offlineDb.local_print_jobs.add(job);
  return job;
}

export async function getPendingPrintJobs(tenantId: string, terminalId: string): Promise<LocalPrintJob[]> {
  return offlineDb.local_print_jobs
    .where("tenantId").equals(tenantId)
    .and((j: LocalPrintJob) => j.terminalId === terminalId && (j.status === "pending" || j.status === "failed"))
    .toArray();
}

export async function getAllPrintJobs(tenantId: string, terminalId: string, limit = 50): Promise<LocalPrintJob[]> {
  const all = await offlineDb.local_print_jobs
    .where("tenantId").equals(tenantId)
    .and((j: LocalPrintJob) => j.terminalId === terminalId)
    .toArray();
  return all
    .sort((a: LocalPrintJob, b: LocalPrintJob) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function getPrintJobStats(tenantId: string, terminalId: string): Promise<{
  pending: number; printing: number; printed: number; failed: number; cancelled: number; total: number;
}> {
  const all = await offlineDb.local_print_jobs
    .where("tenantId").equals(tenantId)
    .and((j: LocalPrintJob) => j.terminalId === terminalId)
    .toArray();
  return {
    pending: all.filter((j: LocalPrintJob) => j.status === "pending").length,
    printing: all.filter((j: LocalPrintJob) => j.status === "printing").length,
    printed: all.filter((j: LocalPrintJob) => j.status === "printed").length,
    failed: all.filter((j: LocalPrintJob) => j.status === "failed").length,
    cancelled: all.filter((j: LocalPrintJob) => j.status === "cancelled").length,
    total: all.length,
  };
}

export async function markPrinting(id: string): Promise<void> {
  const now = new Date().toISOString();
  await offlineDb.local_print_jobs.update(id, { status: "printing", updatedAt: now });
}

export async function markPrinted(id: string): Promise<void> {
  const now = new Date().toISOString();
  await offlineDb.local_print_jobs.update(id, { status: "printed", printedAt: now, updatedAt: now });
}

export async function markPrintFailed(id: string, error: string): Promise<void> {
  const now = new Date().toISOString();
  const job = await offlineDb.local_print_jobs.get(id);
  if (!job) return;
  await offlineDb.local_print_jobs.update(id, {
    status: "failed",
    lastError: error,
    retryCount: (job.retryCount || 0) + 1,
    updatedAt: now,
  });
}

export async function retryPrintJob(id: string): Promise<void> {
  const now = new Date().toISOString();
  await offlineDb.local_print_jobs.update(id, { status: "pending", lastError: undefined, updatedAt: now });
}

export async function cancelPrintJob(id: string): Promise<void> {
  const now = new Date().toISOString();
  await offlineDb.local_print_jobs.update(id, { status: "cancelled", updatedAt: now });
}

export async function deletePrintJob(id: string): Promise<void> {
  await offlineDb.local_print_jobs.delete(id);
}
