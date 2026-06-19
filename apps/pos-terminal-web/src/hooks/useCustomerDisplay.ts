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

import { useEffect, useRef, useCallback, useState } from 'react';
import { getActiveTenantId } from '@/lib/tenant';
import type { CartItem } from './useCart';

export type CfdConnectionStatus = 'connected' | 'reconnecting' | 'offline';

export const CFD_CHANNEL = 'aurapos-cfd-v1';
const CFD_TOKEN_STORAGE_KEY = `${CFD_CHANNEL}:token`;


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
function getStoredCfdToken(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('cfdKey') ?? params.get('cfdToken') ?? params.get('token');
    if (fromUrl) {
      localStorage.setItem(CFD_TOKEN_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return localStorage.getItem(CFD_TOKEN_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

async function ensureCfdToken(): Promise<string> {
  const existing = getStoredCfdToken();
  if (existing) return existing;

  const response = await fetch('/api/cfd/session-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ deviceName: 'Customer Display' }),
  });
  if (!response.ok) return '';

  const body = await response.json().catch(() => null);
  const token = typeof body?.data?.token === 'string' ? body.data.token : '';
  if (token) {
    try { localStorage.setItem(CFD_TOKEN_STORAGE_KEY, token); } catch {}
  }
  return token;
}

export function getCfdTokenForUrl(): string {
  return getStoredCfdToken();
}

// ─── Build WebSocket URL (ws:// in dev, wss:// in prod) ──────────────────────
function buildWsUrl(tenantId: string, cfdToken: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host   = window.location.host;
  const params = new URLSearchParams({ tenantId });
  if (cfdToken) params.set('cfdKey', cfdToken);
  return `${proto}://${host}/ws/cfd?${params.toString()}`;
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
export function useCustomerDisplaySender(enabled = false) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const cfdTokenRef = useRef('');

  // Only fetch a CFD session token when the feature is actually enabled
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    ensureCfdToken()
      .then((token) => { if (!cancelled) cfdTokenRef.current = token; })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof BroadcastChannel === 'undefined') return;
    channelRef.current = new BroadcastChannel(CFD_CHANNEL);
    return () => {
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [enabled]);

  const send = useCallback((msg: CFDMessage) => {
    // No-op when CFD feature is not enabled — avoids unnecessary API calls
    if (!enabled) return;

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
          ...(cfdTokenRef.current ? { 'x-cfd-key': cfdTokenRef.current } : {}),
        },
        body: JSON.stringify(msg),
        // fire-and-forget; jangan block UX
      }).catch(() => {
        // silent — CFD cross-device tidak wajib; BroadcastChannel tetap jalan
      });
    }
  }, [enabled]);

  return { send };
}

// ─── Receiver hook (dipakai di CFD page) ─────────────────────────────────────
// Fitur:
//   - Auto-reconnect dengan exponential backoff (1s → 2s → 4s → ... maks 30s)
//   - Deteksi browser offline/online — reconnect langsung saat online kembali
//   - Hard reload otomatis jika gagal reconnect > MAX_RETRIES kali berturut-turut
//   - Expose status: 'connected' | 'reconnecting' | 'offline'
export function useCustomerDisplayReceiver(
  onMessage: (msg: CFDMessage) => void,
  tenantIdOverride?: string,
): { status: CfdConnectionStatus } {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const [status, setStatus] = useState<CfdConnectionStatus>('reconnecting');

  useEffect(() => {
    const tenantId = resolveCfdTenantId(tenantIdOverride);
    let cfdToken = getStoredCfdToken();

    // ── Load state terakhir dari localStorage (cold-start) ────────────────
    try {
      const raw = localStorage.getItem(`${CFD_CHANNEL}:latest`);
      if (raw) onMessageRef.current(JSON.parse(raw) as CFDMessage);
    } catch {}

    // ── BroadcastChannel — same-device real-time ──────────────────────────
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(CFD_CHANNEL);
      bc.onmessage = (e: MessageEvent<CFDMessage>) => onMessageRef.current(e.data);
    }

    // ── WebSocket — cross-device real-time ────────────────────────────────
    const MAX_RETRIES   = 15;   // reload halaman setelah 15 gagal berturut-turut
    const BASE_DELAY_MS = 1000; // backoff awal 1 detik
    const MAX_DELAY_MS  = 30000; // maks 30 detik antar reconnect

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;
    let retryCount = 0;

    function getDelay() {
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...
      return Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), MAX_DELAY_MS);
    }

    function scheduleReconnect() {
      if (destroyed) return;
      retryCount++;

      // Terlalu banyak gagal → hard reload agar fresh connection
      if (retryCount > MAX_RETRIES) {
        window.location.reload();
        return;
      }

      setStatus(navigator.onLine ? 'reconnecting' : 'offline');
      const delay = getDelay();
      reconnectTimer = setTimeout(connect, delay);
    }

    function connect() {
      if (destroyed || !tenantId) return;
      if (!navigator.onLine) {
        // Browser offline — tunggu event 'online', jangan buka WS dulu
        setStatus('offline');
        return;
      }

      try {
        ws?.close();
        cfdToken = getStoredCfdToken();
        ws = new WebSocket(buildWsUrl(tenantId, cfdToken));
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        if (destroyed) return;
        retryCount = 0; // reset backoff setelah berhasil connect
        setStatus('connected');
      };

      ws.onmessage = (e) => {
        try { onMessageRef.current(JSON.parse(e.data) as CFDMessage); } catch {}
      };

      ws.onclose = () => {
        if (destroyed) return;
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws?.close(); // akan trigger onclose → scheduleReconnect
      };
    }

    // ── Browser online/offline events ─────────────────────────────────────
    const handleOnline = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      retryCount = 0;
      connect(); // langsung reconnect begitu online
    };
    const handleOffline = () => {
      setStatus('offline');
      ws?.close();
    };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    connect();

    return () => {
      destroyed = true;
      bc?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantIdOverride]);

  return { status };
}
