type PaymentMethod = "cash" | "card" | "ewallet" | "other";

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
const FALLBACK_SERVICE_UUIDS = [
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
];
const FALLBACK_CHARACTERISTIC_UUIDS = [
  "0000ffe1-0000-1000-8000-00805f9b34fb",
  "0000ff02-0000-1000-8000-00805f9b34fb",
  "0000ae01-0000-1000-8000-00805f9b34fb",
];
const PRINTER_LINE_WIDTH = 32;
const MAX_WRITE_CHUNK_BYTES = 180;

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
      optionalServices: [SERVICE_UUID, ...FALLBACK_SERVICE_UUIDS],
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
      await this.reconnectIfPossible();
    }

    if (!this.characteristic || !this.device?.gatt?.connected) {
      throw new Error("Printer belum terkoneksi. Buka halaman Printer Hub untuk pair/connect.");
    }

    const data = buildEscPosBytes(buildReceiptText(payload));
    await this.writeInChunks(data);
  }



  private async writeInChunks(data: Uint8Array): Promise<void> {
    if (!this.characteristic) throw new Error("Characteristic printer tidak tersedia.");

    const supportsWriteWithoutResponse = Boolean(this.characteristic?.properties?.writeWithoutResponse);

    for (let offset = 0; offset < data.length; offset += MAX_WRITE_CHUNK_BYTES) {
      const chunk = data.slice(offset, offset + MAX_WRITE_CHUNK_BYTES);

      if (supportsWriteWithoutResponse && typeof this.characteristic.writeValueWithoutResponse === "function") {
        await this.characteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.characteristic.writeValue(chunk);
      }
    }
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

      this.characteristic = await this.resolveWritableCharacteristic(server);
      if (!this.characteristic) {
        throw new Error("Printer terkoneksi tapi channel tulis tidak ditemukan. Coba pair ulang dari Printer Hub.");
      }

      this.setState("connected");
    } catch (error) {
      this.setState("disconnected");
      throw error;
    }
  }

  private async resolveWritableCharacteristic(server: any): Promise<any | null> {
    const servicesToTry = [SERVICE_UUID, ...FALLBACK_SERVICE_UUIDS];
    const charsToTry = [CHARACTERISTIC_UUID, ...FALLBACK_CHARACTERISTIC_UUIDS];

    for (const serviceUuid of servicesToTry) {
      try {
        const service = await server.getPrimaryService(serviceUuid);
        for (const charUuid of charsToTry) {
          try {
            const characteristic = await service.getCharacteristic(charUuid);
            if (characteristic?.properties?.write || characteristic?.properties?.writeWithoutResponse) {
              return characteristic;
            }
          } catch {
            // lanjut coba characteristic berikutnya
          }
        }
      } catch {
        // lanjut coba service berikutnya
      }
    }

    const services = await server.getPrimaryServices();
    for (const service of services ?? []) {
      try {
        const chars = await service.getCharacteristics();
        const writable = chars.find((char: any) => char?.properties?.write || char?.properties?.writeWithoutResponse);
        if (writable) return writable;
      } catch {
        // abaikan service yang tidak bisa di-enumerate
      }
    }

    return null;
  }
}

export const bluetoothReceiptPrinter = new BluetoothReceiptPrinterManager();

const rupiah = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;
const truncate = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
const padRight = (value: string, width: number) => (value.length >= width ? value.slice(0, width) : `${value}${" ".repeat(width - value.length)}`);
const padLeft = (value: string, width: number) => (value.length >= width ? value.slice(0, width) : `${" ".repeat(width - value.length)}${value}`);

const twoCol = (left: string, right: string) => {
  const rightText = truncate(right, PRINTER_LINE_WIDTH - 2);
  const leftWidth = Math.max(1, PRINTER_LINE_WIDTH - rightText.length - 1);
  return `${padRight(truncate(left, leftWidth), leftWidth)} ${rightText}`;
};

const center = (value: string) => {
  const clean = truncate(value, PRINTER_LINE_WIDTH);
  const leftPadding = Math.max(0, Math.floor((PRINTER_LINE_WIDTH - clean.length) / 2));
  return `${" ".repeat(leftPadding)}${clean}`;
};

function buildReceiptText(payload: ReceiptPrintPayload): string {
  const lines: string[] = [];
  lines.push(center(payload.tenantName.toUpperCase()));
  lines.push(center("STRUK PEMBAYARAN"));
  lines.push("=".repeat(PRINTER_LINE_WIDTH));
  lines.push(twoCol("No. Order", payload.orderNumber));
  lines.push(twoCol("Waktu", payload.createdAt.toLocaleString("id-ID")));
  lines.push(twoCol("Metode", payload.paymentMethod.toUpperCase()));
  if (payload.customerName) lines.push(twoCol("Customer", payload.customerName));
  if (payload.tableNumber) lines.push(twoCol("Meja", payload.tableNumber));
  lines.push("-".repeat(PRINTER_LINE_WIDTH));

  lines.push("Item");
  for (const item of payload.items) {
    lines.push(truncate(item.name, PRINTER_LINE_WIDTH));
    const qtyPrice = `${item.qty} x ${rupiah(item.unitPrice)}`;
    lines.push(`${padRight(truncate(qtyPrice, 21), 21)}${padLeft(rupiah(item.total), 11)}`);
  }

  lines.push("-".repeat(PRINTER_LINE_WIDTH));
  lines.push(twoCol("Subtotal", rupiah(payload.subtotal)));
  lines.push(twoCol("Pajak", rupiah(payload.tax)));
  lines.push(twoCol("Service", rupiah(payload.serviceCharge)));
  lines.push("=".repeat(PRINTER_LINE_WIDTH));
  lines.push(twoCol("TOTAL", rupiah(payload.total)));
  lines.push("=".repeat(PRINTER_LINE_WIDTH));
  lines.push(center("Terima kasih"));
  lines.push(center("Simpan struk ini"));
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
