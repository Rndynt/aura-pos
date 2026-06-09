import { bluetoothReceiptPrinter } from "@/lib/receiptPrinter";
import { enqueuePrintJob, getOrCreateTerminalIdentity, markPrintFailed, markPrinted, markPrinting } from "@pos/offline";
import { getActiveTenantId } from "@/lib/tenant";

export function hasPairedReceiptPrinter() {
  return Boolean(bluetoothReceiptPrinter.getPairedDeviceId());
}

export async function enqueueReceiptPrintJob(input: {
  localOrderId?: string;
  orderNumber: string;
  payload: unknown;
}) {
  const tenantId = getActiveTenantId();
  const terminal = await getOrCreateTerminalIdentity(tenantId);
  const job = await enqueuePrintJob({
    tenantId,
    terminalId: terminal.terminalId,
    localOrderId: input.localOrderId,
    orderNumber: input.orderNumber,
    type: "receipt",
    payload: input.payload,
  });

  return { jobId: job.id, tenantId, terminalId: terminal.terminalId };
}

export async function printReceiptNow(printJobId: string | null, receiptPayload: unknown) {
  if (printJobId) await markPrinting(printJobId).catch(() => undefined);
  await bluetoothReceiptPrinter.reconnectIfPossible().catch(() => false);
  await bluetoothReceiptPrinter.print(receiptPayload as any);
  if (printJobId) await markPrinted(printJobId).catch(() => undefined);
}

export async function markReceiptPrintFailed(printJobId: string | null, error: unknown) {
  if (!printJobId) return;
  await markPrintFailed(printJobId, error instanceof Error ? error.message : "Print failed").catch(() => undefined);
}
