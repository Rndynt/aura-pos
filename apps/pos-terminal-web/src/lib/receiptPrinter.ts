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

type PrinterConnectionState = "disconnected" | "connecting" | "connected";

const STORAGE_KEY = "aurapos.receipt_printer.device_id";
const SERVICE_UUID = "000018f0-0000-1000-8000-00805f9b34fb";
const CHARACTERISTIC_UUID = "00002af1-0000-1000-8000-00805f9b34fb";
const PRINTER_LINE_WIDTH = 32;

class BluetoothReceiptPrinterManager {
  private device: any | null = null;
  private characteristic: any | null = null;
  private state: PrinterConnectionState = "disconnected";

  getState(): PrinterConnectionState {
    return this.state;
  }

  getPairedDeviceId(): string | null {
    return localStorage.getItem(STORAGE_KEY);
  }

  private setState(state: PrinterConnectionState) {
    this.state = state;
  }

  async pairAndConnect(): Promise<string> {
    const bluetooth: any = (navigator as any).bluetooth;
    if (!bluetooth) throw new Error("Web Bluetooth tidak didukung browser ini");

    this.setState("connecting");
    const device = await bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID],
    });

    await this.connectDevice(device);
    localStorage.setItem(STORAGE_KEY, device.id);
    return device.name || device.id;
  }

  async reconnectIfPossible(): Promise<boolean> {
    const bluetooth: any = (navigator as any).bluetooth;
    const pairedId = this.getPairedDeviceId();
    if (!bluetooth || !pairedId) return false;

    const devices = await bluetooth.getDevices?.();
    const known = Array.isArray(devices) ? devices.find((d: any) => d.id === pairedId) : null;
    if (!known) return false;

    await this.connectDevice(known);
    return true;
  }

  async disconnect(): Promise<void> {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.characteristic = null;
    this.device = null;
    this.setState("disconnected");
  }

  async forgetDevice(): Promise<void> {
    await this.disconnect();
    localStorage.removeItem(STORAGE_KEY);
  }

  async print(payload: ReceiptPrintPayload): Promise<void> {
    if (!this.characteristic || !this.device?.gatt?.connected) {
      throw new Error("Printer belum terkoneksi. Pair printer di halaman Printer Hub.");
    }
    const data = buildEscPosBytes(buildReceiptText(payload));
    await this.characteristic.writeValue(data);
  }

  private async connectDevice(device: any): Promise<void> {
    try {
      this.setState("connecting");
      this.device = device;

      device.addEventListener?.("gattserverdisconnected", () => {
        this.characteristic = null;
        this.setState("disconnected");
      });

      const server = await device.gatt?.connect();
      if (!server) throw new Error("Gagal connect ke printer bluetooth");

      const service = await server.getPrimaryService(SERVICE_UUID);
      const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
      this.characteristic = characteristic;
      this.setState("connected");
    } catch (error) {
      this.setState("disconnected");
      throw error;
    }
  }
}

export const bluetoothReceiptPrinter = new BluetoothReceiptPrinterManager();

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
    lines.push(truncate(item.name, PRINTER_LINE_WIDTH));
    lines.push(twoCol(`${item.qty} x ${rupiah(item.unitPrice)}`, rupiah(item.total)));
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
