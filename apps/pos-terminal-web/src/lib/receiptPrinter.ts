import type { PaymentMethod } from "@/hooks/useCart";

export interface ReceiptPrintItem {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface ReceiptPrintPayload {
  orderNumber: string;
  tenantName: string;
  customerName?: string;
  tableNumber?: string;
  paymentMethod: PaymentMethod;
  createdAt: Date;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  total: number;
  items: ReceiptPrintItem[];
}

const PRINTER_LINE_WIDTH = 32;

const rupiah = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;

const truncate = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

const padRight = (value: string, width: number) => (value.length >= width ? value.slice(0, width) : `${value}${" ".repeat(width - value.length)}`);

const twoCol = (left: string, right: string) => {
  const rightText = truncate(right, PRINTER_LINE_WIDTH - 2);
  const leftWidth = Math.max(1, PRINTER_LINE_WIDTH - rightText.length - 1);
  return `${padRight(truncate(left, leftWidth), leftWidth)} ${rightText}`;
};

function buildReceiptText(payload: ReceiptPrintPayload): string {
  const lines: string[] = [];
  lines.push(payload.tenantName.toUpperCase());
  lines.push("-".repeat(PRINTER_LINE_WIDTH));
  lines.push(twoCol("Order", payload.orderNumber));
  lines.push(twoCol("Waktu", payload.createdAt.toLocaleString("id-ID")));
  lines.push(twoCol("Metode", payload.paymentMethod.toUpperCase()));
  if (payload.customerName) lines.push(twoCol("Customer", payload.customerName));
  if (payload.tableNumber) lines.push(twoCol("Meja", payload.tableNumber));
  lines.push("-".repeat(PRINTER_LINE_WIDTH));

  for (const item of payload.items) {
    const name = truncate(item.name, PRINTER_LINE_WIDTH);
    const qtyPrice = `${item.qty} x ${rupiah(item.unitPrice)}`;
    lines.push(name);
    lines.push(twoCol(qtyPrice, rupiah(item.total)));
  }

  lines.push("-".repeat(PRINTER_LINE_WIDTH));
  lines.push(twoCol("Subtotal", rupiah(payload.subtotal)));
  lines.push(twoCol("Pajak", rupiah(payload.tax)));
  lines.push(twoCol("Service", rupiah(payload.serviceCharge)));
  lines.push(twoCol("TOTAL", rupiah(payload.total)));
  lines.push("-".repeat(PRINTER_LINE_WIDTH));
  lines.push("Terima kasih");
  lines.push("\n\n\n");

  return lines.join("\n");
}

function buildEscPosBytes(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const init = new Uint8Array([0x1b, 0x40]);
  const alignLeft = new Uint8Array([0x1b, 0x61, 0x00]);
  const feedAndCut = new Uint8Array([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00]);
  const body = encoder.encode(text);

  const out = new Uint8Array(init.length + alignLeft.length + body.length + feedAndCut.length);
  out.set(init, 0);
  out.set(alignLeft, init.length);
  out.set(body, init.length + alignLeft.length);
  out.set(feedAndCut, init.length + alignLeft.length + body.length);
  return out;
}

export async function printReceiptViaBluetooth(payload: ReceiptPrintPayload): Promise<void> {
  if (!("bluetooth" in navigator)) {
    throw new Error("Web Bluetooth tidak didukung browser ini");
  }

  const bluetooth: any = (navigator as any).bluetooth;

  const device = await bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ["000018f0-0000-1000-8000-00805f9b34fb"],
  });

  const server = await device.gatt?.connect();
  if (!server) throw new Error("Gagal connect ke printer bluetooth");

  const service = await server.getPrimaryService("000018f0-0000-1000-8000-00805f9b34fb");
  const characteristic = await service.getCharacteristic("00002af1-0000-1000-8000-00805f9b34fb");

  const text = buildReceiptText(payload);
  const data = buildEscPosBytes(text);
  await characteristic.writeValue(data);

  device.gatt?.disconnect();
}
