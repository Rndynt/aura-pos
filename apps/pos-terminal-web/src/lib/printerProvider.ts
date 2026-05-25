/**
 * PrinterProvider — abstraction layer for all print methods.
 *
 * Implementations:
 *   BluetoothPrinterProvider   — Web Bluetooth BLE (existing receiptPrinter)
 *   BrowserPrintProvider       — window.print() fallback, generates an HTML receipt page
 *   NetworkPrinterProvider     — future: LAN/IP thermal printer via fetch
 */

import type { ReceiptPrintPayload } from "@/lib/receiptPrinter";
import { bluetoothReceiptPrinter } from "@/lib/receiptPrinter";

// ─── Shared payload type ──────────────────────────────────────────────────────

export type PrintPayload = ReceiptPrintPayload;

// ─── Provider interface ───────────────────────────────────────────────────────

export interface PrinterProvider {
  readonly id: string;
  readonly label: string;
  isAvailable(): boolean;
  print(payload: PrintPayload): Promise<void>;
}

// ─── Bluetooth Provider ───────────────────────────────────────────────────────

export class BluetoothPrinterProvider implements PrinterProvider {
  readonly id = "bluetooth";
  readonly label = "Bluetooth Printer";

  isAvailable(): boolean {
    return (
      typeof navigator !== "undefined" &&
      "bluetooth" in navigator &&
      bluetoothReceiptPrinter.getPairedDeviceId() !== null
    );
  }

  async print(payload: PrintPayload): Promise<void> {
    await bluetoothReceiptPrinter.reconnectIfPossible().catch(() => false);
    await bluetoothReceiptPrinter.print(payload);
  }
}

// ─── Browser Print Provider ───────────────────────────────────────────────────

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

function buildReceiptHtml(payload: PrintPayload): string {
  const date =
    payload.createdAt instanceof Date
      ? payload.createdAt
      : new Date(payload.createdAt as unknown as string);

  const rows = payload.items
    .map(
      (item) =>
        `<tr>
          <td style="padding:2px 4px">${item.name}</td>
          <td style="padding:2px 4px;text-align:center">${item.qty}</td>
          <td style="padding:2px 4px;text-align:right">${rupiah(item.unitPrice)}</td>
          <td style="padding:2px 4px;text-align:right">${rupiah(item.total)}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Struk ${payload.orderNumber}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: monospace; font-size: 12px; width: 80mm; margin: 0 auto; padding: 8px; }
  h2 { text-align: center; margin: 4px 0; font-size: 14px; text-transform: uppercase; }
  p.center { text-align: center; margin: 2px 0; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; border-bottom: 1px solid #000; padding: 2px 4px; }
  .right { text-align: right; }
  .total-row td { font-weight: bold; border-top: 1px solid #000; padding-top: 4px; }
  @media print {
    @page { size: 80mm auto; margin: 0; }
  }
</style>
</head>
<body>
<h2>${payload.tenantName}</h2>
<p class="center">STRUK PEMBAYARAN</p>
<hr/>
<p>No. Order: <strong>${payload.orderNumber}</strong></p>
<p>Waktu: ${date.toLocaleString("id-ID")}</p>
<p>Metode: ${payload.paymentMethod.toUpperCase()}</p>
${payload.customerName ? `<p>Customer: ${payload.customerName}</p>` : ""}
${payload.tableNumber ? `<p>Meja: ${payload.tableNumber}</p>` : ""}
<hr/>
<table>
  <thead>
    <tr>
      <th>Item</th><th style="text-align:center">Qty</th>
      <th style="text-align:right">Harga</th><th style="text-align:right">Total</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<hr/>
<table>
  <tr><td>Subtotal</td><td class="right">${rupiah(payload.subtotal)}</td></tr>
  <tr><td>Pajak</td><td class="right">${rupiah(payload.tax)}</td></tr>
  <tr><td>Service</td><td class="right">${rupiah(payload.serviceCharge)}</td></tr>
  <tr class="total-row"><td>TOTAL</td><td class="right">${rupiah(payload.total)}</td></tr>
</table>
<hr/>
<p class="center">Terima kasih!</p>
<p class="center">Simpan struk ini sebagai bukti pembayaran.</p>
</body>
</html>`;
}

export class BrowserPrintProvider implements PrinterProvider {
  readonly id = "browser";
  readonly label = "Print via Browser";

  isAvailable(): boolean {
    return typeof window !== "undefined" && typeof window.print === "function";
  }

  async print(payload: PrintPayload): Promise<void> {
    const html = buildReceiptHtml(payload);
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) throw new Error("Browser memblokir popup. Izinkan popup untuk halaman ini.");
    win.document.write(html);
    win.document.close();
    win.focus();
    // small delay to let CSS load, then print
    await new Promise<void>((resolve) => {
      win.onafterprint = () => { win.close(); resolve(); };
      setTimeout(() => { win.print(); }, 300);
    });
  }
}

// ─── Provider registry ────────────────────────────────────────────────────────

export const bluetoothPrinterProvider = new BluetoothPrinterProvider();
export const browserPrintProvider = new BrowserPrintProvider();

/**
 * Returns the best available provider in priority order:
 *  1. Bluetooth (if paired)
 *  2. null — browser print is disabled; no silent fallback
 */
export function getActivePrinterProvider(): PrinterProvider | null {
  if (bluetoothPrinterProvider.isAvailable()) return bluetoothPrinterProvider;
  return null;
}

/**
 * All registered providers in order. Used by UI to let user choose.
 */
export const ALL_PRINTER_PROVIDERS: PrinterProvider[] = [
  bluetoothPrinterProvider,
  browserPrintProvider,
];
