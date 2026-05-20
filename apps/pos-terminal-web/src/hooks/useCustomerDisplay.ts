/**
 * Customer Facing Display (CFD) — BroadcastChannel Hook
 *
 * Digunakan oleh POS untuk mengirim state ke layar customer.
 * Bekerja antar-tab/antar-window di browser yang sama (satu perangkat).
 */

import { useEffect, useRef, useCallback } from 'react';
import type { CartItem } from './useCart';

export const CFD_CHANNEL = 'aurapos-cfd-v1';

// ─── Message types ────────────────────────────────────────────────────────────
export type CFDMessage =
  | { type: 'idle';      tenantName: string; logoText?: string }
  | { type: 'ordering';  tenantName: string; orderNumber: string;
      items: CFDItem[];  subtotal: number; tax: number; serviceCharge: number; total: number;
      customerName?: string; tableNumber?: string; orderTypeName?: string }
  | { type: 'payment';   tenantName: string; orderNumber: string;
      total: number;     method: string;
      items: CFDItem[];  subtotal: number; tax: number; serviceCharge: number;
      customerName?: string; tableNumber?: string }
  | { type: 'completed'; tenantName: string; orderNumber: string;
      total: number;     amountPaid: number; change: number;
      items: CFDItem[];  subtotal: number; tax: number; serviceCharge: number;
      customerName?: string }
  | { type: 'ping' };

export interface CFDItem {
  id: string;
  name: string;
  category?: string;
  variantName?: string;
  optionsSummary?: string;
  quantity: number;
  unitPrice: number;
  itemTotal: number;
}

// ─── Helper: cart item → CFDItem ─────────────────────────────────────────────
export function toCFDItem(item: CartItem): CFDItem {
  const optionsSummary = item.selectedOptions.length
    ? item.selectedOptions.map((o) => o.option_name).join(', ')
    : undefined;

  return {
    id: item.id,
    name: item.product.name,
    category: item.product.category,
    variantName: item.variant?.name,
    optionsSummary,
    quantity: item.quantity,
    unitPrice: item.itemTotal / item.quantity,
    itemTotal: item.itemTotal,
  };
}

// ─── Sender hook (dipakai di POS) ────────────────────────────────────────────
export function useCustomerDisplaySender() {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    channelRef.current = new BroadcastChannel(CFD_CHANNEL);
    return () => {
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, []);

  const send = useCallback((msg: CFDMessage) => {
    // BroadcastChannel (cross-tab)
    channelRef.current?.postMessage(msg);
    // localStorage fallback (agar CFD bisa load state saat baru dibuka)
    try {
      localStorage.setItem(`${CFD_CHANNEL}:latest`, JSON.stringify(msg));
    } catch {}
  }, []);

  return { send };
}

// ─── Receiver hook (dipakai di CFD page) ────────────────────────────────────
export function useCustomerDisplayReceiver(
  onMessage: (msg: CFDMessage) => void,
) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    // Load last known state dari localStorage
    try {
      const raw = localStorage.getItem(`${CFD_CHANNEL}:latest`);
      if (raw) {
        const msg = JSON.parse(raw) as CFDMessage;
        onMessageRef.current(msg);
      }
    } catch {}

    if (typeof BroadcastChannel === 'undefined') return;

    const ch = new BroadcastChannel(CFD_CHANNEL);
    ch.onmessage = (e: MessageEvent<CFDMessage>) => {
      onMessageRef.current(e.data);
    };

    return () => ch.close();
  }, []);
}
