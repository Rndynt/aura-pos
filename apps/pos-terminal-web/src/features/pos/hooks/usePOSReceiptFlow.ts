import { enqueueReceiptPrintJob, hasPairedReceiptPrinter, markReceiptPrintFailed, printReceiptNow } from "../../pos-core";

export function usePOSReceiptFlow() {
  return {
    enqueueReceiptPrintJob,
    hasPairedReceiptPrinter,
    markReceiptPrintFailed,
    printReceiptNow,
  };
}
