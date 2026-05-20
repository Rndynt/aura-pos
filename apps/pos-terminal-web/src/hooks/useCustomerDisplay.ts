/**
 * Customer Facing Display (CFD) — Cross-device sync via WebSocket
 *
 * Sender (POS):
 *   - BroadcastChannel  → sync ke tab/window lain di device yang SAMA
 *   - POST /api/cfd/update → server broadcast ke device LAIN via WebSocket
 *
 * Receiver (CFD page):
 *   - BroadcastChannel  → terima update dari POS di device yang sama
 *   - WebSocket /ws/cfd → terima update dari server (cross-device)
 *
 * Semua komunikasi di-scope per tenantId — tidak ada cross-tenant leakage.
 */

import { useEffect, useRef, useCallback } from 'react';
import { getActiveTenantId } from '@/lib/tenant';
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

// ─── Build WebSocket URL (ws:// in dev, wss:// in prod) ──────────────────────
function buildWsUrl(tenantId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host   = window.location.host;
  return `${proto}://${host}/ws/cfd?tenantId=${encodeURIComponent(tenantId)}`;
}

// ─── Resolve tenantId untuk CFD receiver ─────────────────────────────────────
// Priority: URL param ?tenantId=xxx  >  localStorage (dari login)
// Ini penting agar Device B yang belum login bisa tetap terima update
// dengan membuka link /display?tenantId=demo-tenant
function resolveCfdTenantId(overrideTenantId?: string): string {
  if (overrideTenantId) return overrideTenantId;
  // Cek URL search params
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('tenantId');
    if (fromUrl) return fromUrl;
  }
  // Fallback ke active tenant (dari login / localStorage)
  return getActiveTenantId();
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
    const tenantId = getActiveTenantId();

    // 1. BroadcastChannel — same-device, instant (no network round-trip)
    channelRef.current?.postMessage(msg);

    // 2. localStorage fallback — agar CFD bisa load state saat baru dibuka
    try {
      localStorage.setItem(`${CFD_CHANNEL}:latest`, JSON.stringify(msg));
    } catch {}

    // 3. Push ke server — agar device lain (via WebSocket) ikut ter-update
    if (tenantId) {
      fetch('/api/cfd/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify(msg),
        // fire-and-forget; jangan block UX
      }).catch(() => {
        // silent — CFD cross-device tidak wajib; BroadcastChannel tetap jalan
      });
    }
  }, []);

  return { send };
}

// ─── Receiver hook (dipakai di CFD page) ─────────────────────────────────────
// tenantId bisa di-pass langsung (dari URL param yang sudah di-parse di page),
// atau di-resolve otomatis dari URL search param / localStorage.
export function useCustomerDisplayReceiver(
  onMessage: (msg: CFDMessage) => void,
  tenantIdOverride?: string,
) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const tenantId = resolveCfdTenantId(tenantIdOverride);

    // ── Load state terakhir dari localStorage (untuk cold-start CFD) ──────
    try {
      const raw = localStorage.getItem(`${CFD_CHANNEL}:latest`);
      if (raw) {
        const msg = JSON.parse(raw) as CFDMessage;
        onMessageRef.current(msg);
      }
    } catch {}

    // ── BroadcastChannel — same-device real-time ──────────────────────────
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(CFD_CHANNEL);
      bc.onmessage = (e: MessageEvent<CFDMessage>) => {
        onMessageRef.current(e.data);
      };
    }

    // ── WebSocket — cross-device real-time, scoped ke tenantId ───────────
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    function connect() {
      if (destroyed || !tenantId) return;

      try {
        ws = new WebSocket(buildWsUrl(tenantId));
      } catch {
        return;
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as CFDMessage;
          onMessageRef.current(msg);
        } catch {}
      };

      ws.onclose = () => {
        if (destroyed) return;
        // Auto-reconnect setelah 3 detik
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      destroyed = true;
      bc?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  // tenantIdOverride sebagai dep agar reconnect jika berubah
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantIdOverride]);
}
