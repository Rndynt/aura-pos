/**
 * Customer Facing Display (CFD) — AuraPOS
 */

import { useState, useEffect, useRef } from 'react';
import { ShoppingCart, CheckCircle2, Clock } from 'lucide-react';
import {
  useCustomerDisplayReceiver,
  getCfdTokenForUrl,
  type CFDMessage,
  type CFDItem,
} from '@/hooks/useCustomerDisplay';
import { getActiveTenantId } from '@/lib/tenant';

/**
 * Anonymous auth: sign in silently on mount so the CFD has a server-side
 * session identity. Non-fatal — existing WebSocket push still works without it.
 */
async function ensureAnonymousSession(): Promise<void> {
  try {
    // Already have a session? Skip.
    const check = await fetch('/api/auth/me', { credentials: 'include' });
    if (check.ok) return;
    // Sign in anonymously
    await fetch('/api/auth/sign-in/anonymous', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  } catch {
    // Non-fatal — CFD still works via WebSocket push
  }
}

const fmt = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

const fmtNum = (n: number) =>
  new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(n);

// ─── Live clock ───────────────────────────────────────────────────────────────
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── Animated total counter ───────────────────────────────────────────────────
function AnimatedTotal({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number>();
  useEffect(() => {
    const start = display;
    if (start === value) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / 500, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (value - start) * e));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className={className} style={style}>{fmtNum(display)}</span>;
}

// ─── IDLE SCREEN ─────────────────────────────────────────────────────────────
type Slide = { id: string; bg: string; headline: string; sub?: string; label?: string; badge?: string; badgeBg?: string; dark?: boolean };
const SLIDES: Slide[] = [
  { id: 'welcome', bg: 'bg-white',      headline: 'Selamat\nDatang',    sub: 'Terima kasih telah berkunjung' },
  { id: 'promo1',  bg: 'bg-blue-600',   headline: 'Diskon\n20%',        label: 'Promo Hari Ini',     sub: 'Untuk semua minuman pilihan', badge: 'Terbatas',     badgeBg: 'bg-white/20', dark: true },
  { id: 'promo2',  bg: 'bg-slate-900',  headline: 'Beli 2\nGratis 1',   label: 'Spesial Weekend',    sub: 'Berlaku setiap Sabtu & Minggu', badge: 'Weekend Only', badgeBg: 'bg-blue-600', dark: true },
  { id: 'loyalty', bg: 'bg-slate-50',   headline: 'Kumpulkan\nPoin',    label: 'Program Loyalitas',  sub: 'Setiap transaksi = poin reward' },
];

function IdleScreen({ tenantName }: { tenantName: string }) {
  const now = useClock();
  const [idx, setIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const slide = SLIDES[idx];

  useEffect(() => {
    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => { setIdx(i => (i + 1) % SLIDES.length); setFading(false); }, 300);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const initials = tenantName.slice(0, 2).toUpperCase();
  const hColor = slide.dark ? 'text-white' : 'text-slate-900';
  const sColor = slide.dark ? 'text-white/55' : 'text-slate-400';
  const lColor = slide.dark ? 'text-white/40' : 'text-blue-500';

  return (
    <div className="flex-1 flex flex-col overflow-hidden select-none">
      <div className="flex-shrink-0 flex items-center justify-between px-8 py-4 bg-white border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-md shadow-blue-200">
            <span className="text-xs font-black text-white">{initials}</span>
          </div>
          <span className="font-bold text-slate-700">{tenantName}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <Clock size={14} className="text-slate-400" />
          <span className="text-lg font-black tabular-nums text-slate-800">{time}</span>
          <span className="text-xs text-slate-400 capitalize hidden sm:block">{date}</span>
        </div>
      </div>
      <div className={`flex-1 flex flex-col items-center justify-center px-16 transition-opacity duration-300 ${slide.bg} ${fading ? 'opacity-0' : 'opacity-100'}`}>
        <div className="w-full max-w-2xl flex flex-col gap-5">
          {slide.label && <p className={`text-[11px] font-bold tracking-[0.2em] uppercase ${lColor}`}>{slide.label}</p>}
          <h2 className={`font-black leading-[0.92] tracking-tighter ${hColor}`} style={{ fontSize: 'clamp(3.5rem,11vw,7.5rem)', whiteSpace: 'pre-line' }}>
            {slide.headline}
          </h2>
          {slide.sub && <p className={`text-lg font-medium ${sColor}`}>{slide.sub}</p>}
          {slide.badge && <span className={`self-start text-xs font-bold text-white px-3 py-1.5 rounded-full ${slide.badgeBg}`}>{slide.badge}</span>}
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center justify-between px-8 py-4 bg-white border-t border-slate-100">
        <div className="flex gap-2">
          {SLIDES.map((s, i) => (
            <button key={s.id} onClick={() => { setFading(true); setTimeout(() => { setIdx(i); setFading(false); }, 300); }}
              className={`rounded-full transition-all duration-300 ${i === idx ? 'w-5 h-2 bg-blue-600' : 'w-2 h-2 bg-slate-200'}`} />
          ))}
        </div>
        <span className="text-[10px] font-semibold text-slate-300 tracking-widest uppercase">Powered by AuraPOS</span>
      </div>
    </div>
  );
}

// ─── ORDERING SCREEN ─────────────────────────────────────────────────────────
// Card accent colors — cycles through items
const CARD_ACCENTS = [
  'border-l-blue-500',
  'border-l-violet-500',
  'border-l-emerald-500',
  'border-l-amber-500',
  'border-l-rose-500',
  'border-l-cyan-500',
  'border-l-orange-500',
  'border-l-pink-500',
];

function ItemCard({ item, index }: { item: CFDItem; index: number }) {
  const accent = CARD_ACCENTS[index % CARD_ACCENTS.length];
  const sub = [item.variantName, item.optionsSummary].filter(Boolean).join(', ');

  return (
    <div
      className={`flex items-start gap-3 bg-white rounded-xl border-l-4 ${accent} border border-slate-100 px-4 py-3 shadow-sm`}
      style={{ animation: `cardIn .25s ease ${index * 0.04}s both` }}
    >
      {/* Qty badge */}
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center mt-0.5">
        <span className="text-sm font-black text-slate-700 tabular-nums leading-none">{item.quantity}</span>
      </div>

      {/* Name + options */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 text-sm leading-snug truncate">{item.name}</p>
        {sub && (
          <p className="text-xs text-slate-400 mt-0.5 leading-tight truncate">{sub}</p>
        )}
      </div>

      {/* Price */}
      <p className="flex-shrink-0 text-sm font-bold text-slate-700 tabular-nums whitespace-nowrap mt-0.5">
        {fmt(item.itemTotal)}
      </p>
    </div>
  );
}

function OrderingScreen(props: {
  tenantName: string; orderNumber: string; items: CFDItem[];
  subtotal: number; tax: number; serviceCharge: number; total: number;
  customerName?: string; tableNumber?: string;
}) {
  const itemCount = props.items.reduce((s, i) => s + i.quantity, 0);

  // Show max 8 cards. If more, show overflow badge on the last card slot.
  const MAX_VISIBLE = 8;
  const visible = props.items.slice(0, MAX_VISIBLE);
  const overflow = props.items.length - MAX_VISIBLE;

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-slate-50">

      {/* ── LEFT: item grid ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* Topbar */}
        <div className="flex-shrink-0 bg-slate-900 px-5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-black text-white">{props.tenantName.slice(0,2).toUpperCase()}</span>
            </div>
            <span className="font-semibold text-white text-sm truncate">{props.tenantName}</span>
            {props.tableNumber && (
              <span className="text-xs text-slate-400 flex-shrink-0">· Meja {props.tableNumber}</span>
            )}
            {props.customerName && (
              <span className="text-xs text-slate-500 flex-shrink-0 truncate">· {props.customerName}</span>
            )}
          </div>
          <span className="text-xs text-slate-500 font-mono flex-shrink-0 ml-3">#{props.orderNumber}</span>
        </div>

        {/* Cards area */}
        <div className="flex-1 min-h-0 overflow-hidden p-4">
          {props.items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-300">
              <ShoppingCart size={40} strokeWidth={1.2} />
              <p className="text-base font-medium">Menambahkan item…</p>
            </div>
          ) : (
            <div
              className="h-full grid gap-3 content-start"
              style={{ gridTemplateColumns: props.items.length <= 4 ? '1fr 1fr' : '1fr 1fr 1fr' }}
            >
              {visible.map((item, i) => (
                <ItemCard key={item.id} item={item} index={i} />
              ))}

              {/* Overflow pill */}
              {overflow > 0 && (
                <div className="flex items-center justify-center bg-slate-200 rounded-xl border border-slate-200 px-4 py-3">
                  <span className="text-sm font-bold text-slate-500">+{overflow} item lainnya</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: total panel ── */}
      <div className="flex-shrink-0 w-72 flex flex-col bg-slate-900 overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 bg-black/30 px-5 py-2.5 flex items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">Total Tagihan</span>
        </div>

        {/* Total — vertically centered, takes up most of the panel */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-3">
          <p className="text-xs font-semibold text-slate-500 tracking-widest uppercase">Total</p>
          <div className="text-center">
            <p className="text-xs font-semibold text-slate-500 mb-1">Rp</p>
            <AnimatedTotal
              value={props.total}
              className="font-black text-white tabular-nums leading-none"
              style={{ fontSize: 'clamp(2rem, 4.5vw, 3rem)' }}
            />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span className="text-sm text-slate-400 font-medium">{itemCount} item</span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="flex-shrink-0 border-t border-white/10 px-5 py-4 space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span className="text-slate-300 font-semibold tabular-nums">{fmt(props.subtotal)}</span>
          </div>
          {props.serviceCharge > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Service</span>
              <span className="text-slate-300 font-semibold tabular-nums">{fmt(props.serviceCharge)}</span>
            </div>
          )}
          {props.tax > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Pajak (11%)</span>
              <span className="text-slate-300 font-semibold tabular-nums">{fmt(props.tax)}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <span className="text-sm font-bold text-white">Total</span>
            <span className="text-sm font-black text-blue-400 tabular-nums">{fmt(props.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared topbar (sama persis dengan OrderingScreen) ────────────────────────
function CFDTopbar(props: {
  tenantName: string; orderNumber: string;
  badge?: React.ReactNode;
  customerName?: string; tableNumber?: string;
}) {
  return (
    <div className="flex-shrink-0 bg-slate-900 px-5 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-black text-white">{props.tenantName.slice(0,2).toUpperCase()}</span>
        </div>
        <span className="font-semibold text-white text-sm truncate">{props.tenantName}</span>
        {props.tableNumber && (
          <span className="text-xs text-slate-400 flex-shrink-0">· Meja {props.tableNumber}</span>
        )}
        {props.customerName && (
          <span className="text-xs text-slate-500 flex-shrink-0 truncate">· {props.customerName}</span>
        )}
        {props.badge && <span className="flex-shrink-0 ml-1">{props.badge}</span>}
      </div>
      <span className="text-xs text-slate-500 font-mono flex-shrink-0 ml-3">#{props.orderNumber}</span>
    </div>
  );
}

// ─── Shared right panel (sama persis dengan OrderingScreen) ───────────────────
function CFDRightPanel(props: {
  headerLabel: string;
  total: number;
  subtotal: number; tax: number; serviceCharge: number;
  children?: React.ReactNode; // konten tambahan di bawah total
}) {
  return (
    <div className="flex-shrink-0 w-72 flex flex-col bg-slate-900 overflow-hidden">
      <div className="flex-shrink-0 bg-black/30 px-5 py-2.5 flex items-center">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">{props.headerLabel}</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-3">
        <p className="text-xs font-semibold text-slate-500 tracking-widest uppercase">Total</p>
        <div className="text-center">
          <p className="text-xs font-semibold text-slate-500 mb-1">Rp</p>
          <AnimatedTotal
            value={props.total}
            className="font-black text-white tabular-nums leading-none"
            style={{ fontSize: 'clamp(2rem, 4.5vw, 3rem)' }}
          />
        </div>
        {props.children}
      </div>
      <div className="flex-shrink-0 border-t border-white/10 px-5 py-4 space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Subtotal</span>
          <span className="text-slate-300 font-semibold tabular-nums">{fmt(props.subtotal)}</span>
        </div>
        {props.serviceCharge > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Service</span>
            <span className="text-slate-300 font-semibold tabular-nums">{fmt(props.serviceCharge)}</span>
          </div>
        )}
        {props.tax > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Pajak</span>
            <span className="text-slate-300 font-semibold tabular-nums">{fmt(props.tax)}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <span className="text-sm font-bold text-white">Total</span>
          <span className="text-sm font-black text-blue-400 tabular-nums">{fmt(props.total)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── PAYMENT — QRIS ───────────────────────────────────────────────────────────
function QRISPaymentScreen(props: {
  tenantName: string; orderNumber: string; total: number;
  subtotal: number; tax: number; serviceCharge: number;
  customerName?: string; tableNumber?: string;
}) {
  const qrData = `AURAPOS-QRIS-${props.orderNumber}-${props.total}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrData)}&qzone=2&color=000000&bgcolor=ffffff&format=png`;

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-slate-50">
      {/* ── LEFT: QR code ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <CFDTopbar
          tenantName={props.tenantName}
          orderNumber={props.orderNumber}
          customerName={props.customerName}
          tableNumber={props.tableNumber}
          badge={
            <span className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              QRIS
            </span>
          }
        />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 bg-slate-50">
          {/* QR card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/60 p-6 flex flex-col items-center gap-4"
            style={{ animation: 'fadeUp .35s ease both' }}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Scan QRIS untuk Membayar</p>
            <div className="w-56 h-56 rounded-xl overflow-hidden border border-slate-100">
              <img src={qrUrl} alt="QRIS" className="w-full h-full object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            {/* Wallet badges */}
            <div className="flex flex-wrap gap-1.5 justify-center pt-1">
              {['GoPay','OVO','Dana','LinkAja','ShopeePay','BCA Mobile'].map(app => (
                <span key={app} className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{app}</span>
              ))}
            </div>
          </div>
          {/* Waiting indicator */}
          <div className="flex items-center gap-2 text-amber-600">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-sm font-semibold">Menunggu konfirmasi pembayaran…</p>
          </div>
        </div>
      </div>

      {/* ── RIGHT: total panel ── */}
      <CFDRightPanel
        headerLabel="Scan QRIS"
        total={props.total}
        subtotal={props.subtotal}
        tax={props.tax}
        serviceCharge={props.serviceCharge}
      >
        <div className="flex items-center gap-2 mt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-sm text-amber-400 font-medium">Menunggu Pembayaran</span>
        </div>
      </CFDRightPanel>
    </div>
  );
}

// ─── PAYMENT — non-QRIS ───────────────────────────────────────────────────────
const METHOD_LABEL: Record<string, string> = { cash:'Tunai', card:'Kartu', transfer:'Transfer', ewallet:'QRIS' };
const METHOD_ICON: Record<string, string> = { cash:'💵', card:'💳', transfer:'🏦', ewallet:'📲' };

function CashPaymentScreen(props: {
  tenantName: string; orderNumber: string; total: number; method: string;
  subtotal: number; tax: number; serviceCharge: number;
  customerName?: string; tableNumber?: string;
}) {
  const label = METHOD_LABEL[props.method] ?? props.method;
  const icon  = METHOD_ICON[props.method] ?? '💰';

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-slate-50">
      {/* ── LEFT: method indicator ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <CFDTopbar
          tenantName={props.tenantName}
          orderNumber={props.orderNumber}
          customerName={props.customerName}
          tableNumber={props.tableNumber}
          badge={
            <span className="flex items-center gap-1.5 bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
              {label}
            </span>
          }
        />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 bg-slate-50">
          <div className="flex flex-col items-center gap-5" style={{ animation: 'fadeUp .35s ease both' }}>
            {/* Method icon */}
            <div className="w-24 h-24 rounded-2xl bg-white border border-slate-200 shadow-lg shadow-slate-200/60 flex items-center justify-center text-5xl">
              {icon}
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Metode Pembayaran</p>
              <p className="text-2xl font-black text-slate-800">{label}</p>
            </div>
            {/* Spinner + status */}
            <div className="flex items-center gap-3 text-slate-400 mt-2">
              <div className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin flex-shrink-0" />
              <p className="text-sm font-medium">Kasir sedang memproses pembayaran…</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT: total panel ── */}
      <CFDRightPanel
        headerLabel={label}
        total={props.total}
        subtotal={props.subtotal}
        tax={props.tax}
        serviceCharge={props.serviceCharge}
      >
        <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-3 rounded-full border-2 border-slate-700 border-t-blue-400 animate-spin flex-shrink-0" />
          <span className="text-sm text-slate-400 font-medium">Memproses</span>
        </div>
      </CFDRightPanel>
    </div>
  );
}

function PaymentScreen(props: {
  tenantName: string; orderNumber: string; total: number; method: string;
  items: CFDItem[]; subtotal: number; tax: number; serviceCharge: number;
  customerName?: string; tableNumber?: string;
}) {
  if (props.method === 'qris' || props.method === 'ewallet') return <QRISPaymentScreen {...props} />;
  return <CashPaymentScreen {...props} />;
}

// ─── COMPLETED SCREEN ─────────────────────────────────────────────────────────
function CompletedScreen(props: {
  tenantName: string; orderNumber: string;
  total: number; amountPaid: number; change: number;
  subtotal: number; tax: number; serviceCharge: number;
  customerName?: string;
}) {
  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-slate-50">
      {/* ── LEFT: success area ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <CFDTopbar
          tenantName={props.tenantName}
          orderNumber={props.orderNumber}
          customerName={props.customerName}
          badge={
            <span className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Lunas
            </span>
          }
        />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 bg-slate-50">
          <div className="flex flex-col items-center gap-5" style={{ animation: 'fadeUp .4s ease both' }}>
            {/* Checkmark circle */}
            <div
              className="w-24 h-24 rounded-full bg-emerald-500 flex items-center justify-center shadow-xl shadow-emerald-200"
              style={{ animation: 'popIn .5s cubic-bezier(.175,.885,.32,1.275) .08s both' }}
            >
              <CheckCircle2 size={52} className="text-white" strokeWidth={2.5} />
            </div>

            <div className="text-center">
              <p className="text-2xl font-black text-emerald-600 mb-2">Pembayaran Berhasil!</p>
              <p className="text-lg font-semibold text-slate-500">Terima kasih telah berkunjung 🙏</p>
              {props.customerName && (
                <p className="text-sm text-slate-400 mt-1">
                  Sampai jumpa, <strong className="text-slate-600">{props.customerName}</strong>!
                </p>
              )}
            </div>

            {/* Kembalian — hanya tampil jika ada */}
            {props.change > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 px-8 py-4 text-center shadow-sm"
                style={{ animation: 'fadeUp .4s ease .15s both' }}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em] mb-1">Kembalian</p>
                <p className="font-black text-emerald-600 tabular-nums" style={{ fontSize: 'clamp(2rem,5vw,3rem)' }}>
                  {fmt(props.change)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT: total panel ── */}
      <div className="flex-shrink-0 w-72 flex flex-col bg-slate-900 overflow-hidden">
        <div className="flex-shrink-0 bg-emerald-600/30 px-5 py-2.5 flex items-center">
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.18em]">Pembayaran Lunas</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-3">
          <p className="text-xs font-semibold text-slate-500 tracking-widest uppercase">Total Dibayar</p>
          <div className="text-center">
            <p className="text-xs font-semibold text-slate-500 mb-1">Rp</p>
            <AnimatedTotal
              value={props.total}
              className="font-black text-white tabular-nums leading-none"
              style={{ fontSize: 'clamp(2rem, 4.5vw, 3rem)' }}
            />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-sm text-emerald-400 font-medium">Lunas</span>
          </div>
        </div>
        <div className="flex-shrink-0 border-t border-white/10 px-5 py-4 space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span className="text-slate-300 font-semibold tabular-nums">{fmt(props.subtotal)}</span>
          </div>
          {props.serviceCharge > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Service</span>
              <span className="text-slate-300 font-semibold tabular-nums">{fmt(props.serviceCharge)}</span>
            </div>
          )}
          {props.tax > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Pajak</span>
              <span className="text-slate-300 font-semibold tabular-nums">{fmt(props.tax)}</span>
            </div>
          )}
          {props.amountPaid > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Dibayar</span>
              <span className="text-slate-300 font-semibold tabular-nums">{fmt(props.amountPaid)}</span>
            </div>
          )}
          {props.change > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <span className="text-sm font-bold text-white">Kembalian</span>
              <span className="text-sm font-black text-emerald-400 tabular-nums">{fmt(props.change)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FULLSCREEN HOOK ──────────────────────────────────────────────────────────
function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const enter = async () => {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      // Lock to landscape if supported
      try {
        await (screen.orientation as any).lock('landscape');
      } catch {
        // Not all browsers support orientation lock — silently ignore
      }
    } catch {
      // Fullscreen may be blocked (e.g. no user gesture) — ignore
    }
  };

  const exit = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* ignore */ }
  };

  return { isFullscreen, enter, exit };
}

// ─── FULLSCREEN PROMPT OVERLAY ────────────────────────────────────────────────
function FullscreenPrompt({ onEnter, cfdUrl }: { onEnter: () => void; cfdUrl: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Reliable clipboard fallback — works inside iframes & non-HTTPS contexts
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = cfdUrl;
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(cfdUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }).catch(() => { fallback(); setCopied(true); setTimeout(() => setCopied(false), 2500); });
    } else {
      fallback();
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 px-4 select-none overflow-y-auto py-8"
      style={{ background: 'rgba(2,6,23,0.92)', backdropFilter: 'blur(10px)', animation: 'fadeUp .3s ease both' }}
    >
      {/* Header */}
      <div className="text-center">
        <p className="text-white/40 text-[10px] font-bold tracking-[0.2em] uppercase mb-1.5">Customer Facing Display</p>
        <p className="text-white font-black text-xl sm:text-2xl">Tampilan untuk Pelanggan</p>
        <p className="text-white/40 text-xs sm:text-sm mt-1">Halaman ini dirancang untuk layar yang menghadap pelanggan</p>
      </div>

      {/* Cards — stack on mobile, side-by-side on sm+ */}
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-lg">

        {/* Card 1 — share to another device */}
        <div className="flex-1 flex flex-col items-center gap-3 bg-white/8 border border-white/12 rounded-2xl px-4 py-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-white font-bold text-sm">Buka di Layar Lain</p>
            <p className="text-white/40 text-xs mt-0.5 leading-snug">Salin link, buka di monitor/tablet pelanggan</p>
          </div>
          {/* URL bar + copy button */}
          <div className="w-full flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2">
            <span className="flex-1 text-white/40 text-[10px] font-mono truncate">{cfdUrl}</span>
            <button
              onClick={handleCopy}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                copied
                  ? 'bg-emerald-500/25 border border-emerald-400/40 text-emerald-400'
                  : 'bg-blue-500/25 border border-blue-400/40 text-blue-400 active:bg-blue-500/40'
              }`}
            >
              {copied ? (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Tersalin!
                </>
              ) : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                  </svg>
                  Copy URL
                </>
              )}
            </button>
          </div>
        </div>

        {/* Card 2 — fullscreen on this device */}
        <div
          onClick={onEnter}
          className="flex-1 flex flex-col items-center justify-center gap-3 bg-white/8 border border-white/12 rounded-2xl px-4 py-4 cursor-pointer active:bg-white/14 active:scale-[0.98] transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-500/20 border border-slate-400/30 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
              <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-white font-bold text-sm">Fullscreen di Sini</p>
            <p className="text-white/40 text-xs mt-0.5 leading-snug">Gunakan layar ini sebagai display pelanggan</p>
          </div>
          <div className="w-full flex items-center justify-center gap-1.5 bg-black/30 border border-white/10 rounded-xl px-3 py-2">
            <span className="text-white/50 text-xs font-medium">Tap untuk mulai</span>
          </div>
        </div>
      </div>

      {/* Footer hint */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/8 border border-white/10">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
        <span className="text-white/50 text-xs font-medium">Real-time sync dengan POS kasir aktif</span>
      </div>
    </div>
  );
}

// ─── FULLSCREEN BUTTON (pojok kanan bawah saat tidak fullscreen) ──────────────
function FullscreenButton({ onClick }: { onClick: () => void }) {
  const [visible, setVisible] = useState(false);

  // Show on mouse move, hide after 3s
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = () => { setVisible(true); clearTimeout(timer); timer = setTimeout(() => setVisible(false), 3000); };
    window.addEventListener('mousemove', show);
    window.addEventListener('touchstart', show);
    return () => { window.removeEventListener('mousemove', show); window.removeEventListener('touchstart', show); clearTimeout(timer); };
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      title="Masuk Fullscreen"
      className="fixed bottom-4 right-4 z-40 w-10 h-10 rounded-xl bg-slate-900/80 border border-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-slate-800 transition-colors"
      style={{ animation: 'fadeUp .2s ease both' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
        <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
      </svg>
    </button>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function CustomerDisplayPage() {
  const [msg, setMsg] = useState<CFDMessage>({ type: 'idle', tenantName: 'AuraPOS' });
  const { isFullscreen, enter } = useFullscreen();

  // CFD anonymous session — gives this display a server-side identity
  useEffect(() => {
    ensureAnonymousSession();
  }, []);

  // Ambil tenantId dari URL (?tenantId=xxx) agar Device B tanpa login bisa sync
  const tenantIdFromUrl = new URLSearchParams(window.location.search).get('tenantId') ?? undefined;

  // Jika tenantId sudah ada di URL → device ini adalah layar pelanggan, langsung tampil
  // Jika tidak → device kasir, tampilkan prompt setup dulu
  const [showPrompt, setShowPrompt] = useState(!tenantIdFromUrl);
  const [sessionTenantId, setSessionTenantId] = useState<string | null>(null);

  // Fetch tenantId dari session login — karena CURRENT_TENANT_ID sengaja kosong,
  // satu-satunya cara dapat tenantId yang benar adalah dari /api/auth/me
  useEffect(() => {
    if (tenantIdFromUrl) return; // sudah ada di URL, tidak perlu fetch
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(body => {
        const tid = body?.data?.tenantId;
        if (tid) setSessionTenantId(tid);
      })
      .catch(() => {});
  }, [tenantIdFromUrl]);

  const { status } = useCustomerDisplayReceiver((m) => { if (m.type !== 'ping') setMsg(m); }, tenantIdFromUrl);
  const tenantName = msg.type !== 'ping' && 'tenantName' in msg ? msg.tenantName : 'AuraPOS';

  // Bangun link CFD yang mengandung tenantId — ini yang di-share ke Device B
  // Priority: ?tenantId dari URL  >  session login  >  localStorage
  const cfdUrl = (() => {
    const base = `${window.location.origin}/display`;
    const tid = tenantIdFromUrl || sessionTenantId || getActiveTenantId();
    if (!tid) return base;
    const params = new URLSearchParams({ tenantId: tid });
    const cfdToken = getCfdTokenForUrl();
    if (cfdToken) params.set('cfdKey', cfdToken);
    return `${base}?${params.toString()}`;
  })();

  const handleEnterFullscreen = async () => {
    await enter();
    setShowPrompt(false);
  };

  // Jika sudah fullscreen dari awal (mis. dibuka ulang), langsung hide prompt
  useEffect(() => {
    if (isFullscreen) setShowPrompt(false);
  }, [isFullscreen]);

  return (
    <>
      <style>{`
        @keyframes popIn  { from{opacity:0;transform:scale(.4)} to{opacity:1;transform:scale(1)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:none} }
        @keyframes cardIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        * { -webkit-font-smoothing:antialiased; }
        body { overflow:hidden; }
      `}</style>
      <div className="relative w-screen h-screen flex flex-col overflow-hidden bg-slate-50">
        {msg.type === 'idle'      && <IdleScreen     tenantName={tenantName} />}
        {msg.type === 'ordering'  && <OrderingScreen  {...msg} />}
        {msg.type === 'payment'   && <PaymentScreen   {...msg} />}
        {msg.type === 'completed' && <CompletedScreen {...msg} />}

        {/* Indikator koneksi — pojok kiri bawah, hanya tampil saat tidak connected */}
        {!showPrompt && status !== 'connected' && (
          <div
            className="fixed bottom-4 left-4 z-40 flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-sm border text-xs font-semibold"
            style={{
              background: status === 'offline' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
              borderColor: status === 'offline' ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)',
              color: status === 'offline' ? '#f87171' : '#fbbf24',
              animation: 'fadeUp .25s ease both',
            }}
          >
            {status === 'offline' ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23"/>
                  <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
                  <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
                  <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
                  <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                  <line x1="12" y1="20" x2="12.01" y2="20"/>
                </svg>
                Offline — menunggu koneksi…
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                Menyambung kembali…
              </>
            )}
          </div>
        )}

        {/* Fullscreen prompt — tampil saat pertama buka */}
        {showPrompt && <FullscreenPrompt onEnter={handleEnterFullscreen} cfdUrl={cfdUrl} />}

        {/* Tombol fullscreen kecil — muncul saat kursor gerak, tidak fullscreen */}
        {!isFullscreen && !showPrompt && <FullscreenButton onClick={enter} />}
      </div>
    </>
  );
}
