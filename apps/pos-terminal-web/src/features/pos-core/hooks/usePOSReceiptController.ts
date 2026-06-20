import { buildReceiptPayload, type BuildReceiptPayloadInput } from "../mappers/receiptPayloadMapper";
import { enqueueReceiptPrintJob, hasPairedReceiptPrinter, markReceiptPrintFailed, printReceiptNow } from "../services/posPrinterService";

export function usePOSReceiptController() {
  const hasPairedPrinter = hasPairedReceiptPrinter();
  const shouldAutoPrintReceipt = hasPairedPrinter;
  return { buildReceiptPayload, enqueueReceiptPrintJob, hasPairedPrinter, markReceiptPrintFailed, printReceiptNow, shouldAutoPrintReceipt };
}

export type { BuildReceiptPayloadInput };
