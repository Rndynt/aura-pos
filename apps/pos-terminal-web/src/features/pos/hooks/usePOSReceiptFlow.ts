import { enqueueReceiptPrintJob, hasPairedReceiptPrinter, markReceiptPrintFailed, printReceiptNow } from "../services/posPrinterService";

export function usePOSReceiptFlow() {
  return {
    enqueueReceiptPrintJob,
    hasPairedReceiptPrinter,
    markReceiptPrintFailed,
    printReceiptNow,
  };
}
