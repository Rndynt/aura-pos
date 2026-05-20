/**
 * Customer Facing Display (CFD)
 * Tampilan untuk layar yang menghadap pelanggan.
 */

import { useState, useEffect, useRef } from 'react';
import { Monitor, ShoppingCart, CheckCircle2 } from 'lucide-react';
import {
  useCustomerDisplayReceiver,
  type CFDMessage,
  type CFDItem,
} from '@/hooks/useCustomerDisplay';

const fmt = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

// ─── Animated number ──────────────────────────────────────────────────────────
function AnimatedTotal({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number>();
  useEffect(() => {
    const start = display;
    if (start === value) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / 400, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (value - start) * e));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className={className}>{fmt(display)}</span>;
}

// ─── Logo badge ───────────────────────────────────────────────────────────────
function LogoBadge({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.slice(0, 2).toUpperCase();
  const cls = size === 'lg'
    ? 'w-24 h-24 rounded-3xl text-3xl shadow-2xl shadow-blue-200'
    : size === 'sm'
    ? 'w-9 h-9 rounded-xl text-sm'
    : 'w-12 h-12 rounded-2xl text-base';
  return (
    <div className={`${cls} bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0`}>
      <span className="font-black text-white tracking-tight select-none">{initials}</span>
    </div>
  );
}

// ─── Item row ─────────────────────────────────────────────────────────────────
function ItemRow({ item, idx }: { item: CFDItem; idx: number }) {
  return (
    <div
      className="flex items-start gap-3 py-3 px-4 border-b border-slate-100 last:border-0"
      style={{ animation: 'slideIn .2s ease both', animationDelay: `${idx * 30}ms` }}
    >
      <div className="w-9 h-9 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-xs font-black text-blue-600">{item.quantity}×</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-800 leading-tight text-sm md:text-base">{item.name}</p>
        {(item.variantName || item.optionsSummary) && (
          <p className="text-xs text-slate-400 mt-0.5">
            {[item.variantName, item.optionsSummary].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <p className="font-bold text-slate-700 tabular-nums text-sm md:text-base whitespace-nowrap mt-0.5">
        {fmt(item.itemTotal)}
      </p>
    </div>
  );
}

// ─── Summary lines ─────────────────────────────────────────────────────────────
function SummaryLines({ subtotal, tax, serviceCharge, total }: {
  subtotal: number; tax: number; serviceCharge: number; total: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm text-slate-500">
        <span>Subtotal</span>
        <span className="font-semibold tabular-nums">{fmt(subtotal)}</span>
      </div>
      {serviceCharge > 0 && (
        <div className="flex justify-between text-sm text-slate-500">
          <span>Service Charge</span>
          <span className="font-semibold tabular-nums">{fmt(serviceCharge)}</span>
        </div>
      )}
      {tax > 0 && (
        <div className="flex justify-between text-sm text-slate-500">
          <span>Pajak</span>
          <span className="font-semibold tabular-nums">{fmt(tax)}</span>
        </div>
      )}
      <div className="flex justify-between items-center pt-2 border-t-2 border-slate-200">
        <span className="font-bold text-slate-700">Total</span>
        <AnimatedTotal value={total} className="text-2xl md:text-3xl font-black text-blue-600 tabular-nums" />
      </div>
    </div>
  );
}

// ─── Live clock ───────────────────────────────────────────────────────────────
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── IDLE ─────────────────────────────────────────────────────────────────────
function IdleScreen({ tenantName }: { tenantName: string }) {
  const now = useClock();

  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const initials = tenantName.slice(0, 2).toUpperCase();

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-blue-50 via-white to-slate-50 relative overflow-hidden">
      {/* Soft ambient blobs — consistent with app's blue-600 primary */}
      <div style={{ animation: 'orb1 9s ease-in-out infinite' }}
        className="absolute -top-[20%] -left-[10%] w-[55vw] h-[55vw] rounded-full bg-blue-100/70 blur-[90px] pointer-events-none" />
      <div style={{ animation: 'orb2 11s ease-in-out infinite' }}
        className="absolute -bottom-[20%] -right-[10%] w-[50vw] h-[50vw] rounded-full bg-indigo-100/60 blur-[100px] pointer-events-none" />

      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-8 pt-6 relative z-10">
        <div className="flex items-center gap-3">
          {/* Logo badge — matches app's blue-600 gradient */}
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm shadow-blue-200">
            <span className="text-xs font-black text-white tracking-wide select-none">{initials}</span>
          </div>
          <span className="text-sm font-semibold text-slate-500">{tenantName}</span>
        </div>
        <div className="flex items-center gap-2 bg-white/80 border border-slate-200 rounded-full px-3 py-1.5 shadow-sm backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-500">Buka</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5 relative z-10 px-8">

        {/* Clock — slate-900, font-black, same weight as app headings */}
        <div className="text-center" style={{ animation: 'fadeUp .7s ease both' }}>
          <div
            className="font-black text-slate-900 leading-none tracking-tighter tabular-nums select-none"
            style={{ fontSize: 'clamp(4.5rem,14vw,8.5rem)', fontVariantNumeric: 'tabular-nums' }}
          >
            {timeStr}
          </div>
          <p className="text-slate-400 font-medium mt-2 capitalize" style={{ fontSize: 'clamp(.85rem,1.4vw,1.1rem)' }}>
            {dateStr}
          </p>
        </div>

        {/* Divider line — same slate border tone as app */}
        <div className="w-12 h-0.5 bg-slate-200 rounded-full" style={{ animation: 'fadeUp .7s ease .12s both' }} />

        {/* Welcome card — white card, same as app's card style */}
        <div
          className="bg-white/90 border border-slate-200 rounded-2xl px-8 py-5 flex flex-col items-center gap-2 shadow-sm backdrop-blur-sm text-center"
          style={{ animation: 'fadeUp .7s ease .22s both' }}
        >
          <p className="font-black text-slate-800 tracking-tight" style={{ fontSize: 'clamp(1.1rem,2.5vw,1.6rem)' }}>
            Selamat datang
          </p>
          <p className="text-slate-400 font-medium text-sm md:text-base">
            Kasir siap melayani Anda
          </p>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-8 pb-5 relative z-10">
        <div className="flex items-center gap-1.5 text-slate-300">
          <Monitor size={11} />
          <span className="text-[11px] font-medium">Customer Display</span>
        </div>
        <span className="text-[11px] text-slate-300 font-medium">AuraPOS</span>
      </div>
    </div>
  );
}

// ─── ORDERING ─────────────────────────────────────────────────────────────────
function OrderingScreen(props: {
  tenantName: string; orderNumber: string; items: CFDItem[];
  subtotal: number; tax: number; serviceCharge: number; total: number;
  customerName?: string; tableNumber?: string; orderTypeName?: string;
}) {
  const itemCount = props.items.reduce((s, i) => s + i.quantity, 0);
  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LogoBadge name={props.tenantName} size="sm" />
          <div>
            <p className="font-bold text-slate-800 text-sm md:text-base leading-tight">{props.tenantName}</p>
            {(props.customerName || props.tableNumber) && (
              <p className="text-xs text-slate-400">
                {props.tableNumber && `Meja ${props.tableNumber}`}
                {props.tableNumber && props.customerName && ' · '}
                {props.customerName}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-xl">
          <ShoppingCart size={13} className="text-blue-500" />
          <span className="text-xs md:text-sm font-bold text-blue-600">Order #{props.orderNumber}</span>
        </div>
      </div>

      {/* Body — responsive */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Items list */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          <div className="p-3 md:p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">
              Pesanan · {itemCount} item
            </p>
            {props.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 text-slate-300 py-16">
                <ShoppingCart size={36} />
                <p className="text-sm font-medium">Menambahkan item…</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {props.items.map((item, i) => (
                  <ItemRow key={item.id} item={item} idx={i} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Summary panel — right on desktop, bottom on mobile */}
        <div className="flex-shrink-0 md:w-72 border-t md:border-t-0 md:border-l border-slate-200 bg-white p-4 md:p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Ringkasan</p>
          <SummaryLines
            subtotal={props.subtotal}
            tax={props.tax}
            serviceCharge={props.serviceCharge}
            total={props.total}
          />
          <p className="text-xs text-slate-400 mt-3">{itemCount} item</p>
        </div>
      </div>
    </div>
  );
}

// ─── PAYMENT (QRIS) ───────────────────────────────────────────────────────────
function QRISPaymentScreen(props: {
  tenantName: string; orderNumber: string; total: number;
  items: CFDItem[]; subtotal: number; tax: number; serviceCharge: number;
}) {
  const qrData = `AURAPOS-QRIS-${props.orderNumber}-${props.total}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrData)}&qzone=2&color=000000&bgcolor=ffffff&format=png`;

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LogoBadge name={props.tenantName} size="sm" />
          <p className="font-bold text-slate-800 text-sm">{props.tenantName}</p>
        </div>
        <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-1.5">
          Order #{props.orderNumber}
        </span>
      </div>

      {/* Body — responsive */}
      <div className="flex-1 flex flex-col md:flex-row items-stretch overflow-auto">
        {/* QR code section */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-lg p-6 flex flex-col items-center gap-4 w-full max-w-sm">
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Scan untuk Membayar</p>
            <div className="w-52 h-52 md:w-56 md:h-56 bg-white border-2 border-slate-200 rounded-2xl flex items-center justify-center overflow-hidden">
              <img
                src={qrUrl}
                alt="QRIS QR Code"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div className="text-center space-y-1">
              <p className="text-xs text-slate-400">Scan dengan e-wallet atau mobile banking</p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {['GoPay', 'OVO', 'Dana', 'LinkAja', 'ShopeePay'].map(app => (
                  <span key={app} className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{app}</span>
                ))}
              </div>
            </div>
            <div className="w-full pt-3 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-400 mb-0.5">Total Pembayaran</p>
              <p className="text-3xl md:text-4xl font-black text-slate-800 tabular-nums">{fmt(props.total)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-amber-600">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-sm font-semibold">Menunggu konfirmasi pembayaran…</p>
          </div>
        </div>

        {/* Order summary — right on desktop, below on mobile */}
        <div className="md:w-64 flex-shrink-0 border-t md:border-t-0 md:border-l border-slate-200 bg-white p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Pesanan</p>
          <div className="bg-slate-50 rounded-xl overflow-hidden mb-4">
            {props.items.map((item, i) => (
              <ItemRow key={item.id} item={item} idx={i} />
            ))}
          </div>
          <SummaryLines subtotal={props.subtotal} tax={props.tax} serviceCharge={props.serviceCharge} total={props.total} />
        </div>
      </div>
    </div>
  );
}

// ─── PAYMENT (non-QRIS) ───────────────────────────────────────────────────────
const METHOD_LABELS: Record<string, string> = {
  cash: 'Tunai', card: 'Kartu Debit / Kredit',
  qris: 'QRIS', transfer: 'Transfer Bank', ewallet: 'E-Wallet',
};
const METHOD_EMOJI: Record<string, string> = {
  cash: '💵', card: '💳', qris: '📱', transfer: '🏦', ewallet: '📲',
};
const METHOD_COLOR: Record<string, string> = {
  cash: 'bg-green-50 border-green-100 text-green-700',
  card: 'bg-purple-50 border-purple-100 text-purple-700',
  transfer: 'bg-blue-50 border-blue-100 text-blue-700',
  ewallet: 'bg-pink-50 border-pink-100 text-pink-700',
};

function CashPaymentScreen(props: {
  tenantName: string; orderNumber: string; total: number; method: string;
  items: CFDItem[]; subtotal: number; tax: number; serviceCharge: number;
}) {
  const colorClass = METHOD_COLOR[props.method] ?? 'bg-slate-50 border-slate-200 text-slate-700';
  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LogoBadge name={props.tenantName} size="sm" />
          <p className="font-bold text-slate-800 text-sm">{props.tenantName}</p>
        </div>
        <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-1.5">
          Order #{props.orderNumber}
        </span>
      </div>

      <div className="flex-1 flex flex-col md:flex-row items-stretch overflow-auto">
        {/* Payment info */}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-lg px-8 py-8 flex flex-col items-center gap-5 w-full max-w-sm">
            <div className={`rounded-2xl border px-5 py-3 flex items-center gap-3 ${colorClass}`}>
              <span className="text-2xl">{METHOD_EMOJI[props.method] ?? '💰'}</span>
              <span className="text-base font-bold">{METHOD_LABELS[props.method] ?? props.method}</span>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-400 mb-1">Total Pembayaran</p>
              <p className="text-4xl md:text-5xl font-black text-slate-800 tabular-nums">{fmt(props.total)}</p>
            </div>
            <div className="flex items-center gap-3 text-slate-400">
              <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
              <p className="text-sm font-medium">Mohon tunggu, kasir sedang memproses…</p>
            </div>
          </div>
        </div>

        {/* Order summary */}
        <div className="md:w-64 flex-shrink-0 border-t md:border-t-0 md:border-l border-slate-200 bg-white p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Pesanan</p>
          <div className="bg-slate-50 rounded-xl overflow-hidden mb-4">
            {props.items.map((item, i) => (
              <ItemRow key={item.id} item={item} idx={i} />
            ))}
          </div>
          <SummaryLines subtotal={props.subtotal} tax={props.tax} serviceCharge={props.serviceCharge} total={props.total} />
        </div>
      </div>
    </div>
  );
}

function PaymentScreen(props: {
  tenantName: string; orderNumber: string; total: number; method: string;
  items: CFDItem[]; subtotal: number; tax: number; serviceCharge: number;
  customerName?: string; tableNumber?: string;
}) {
  if (props.method === 'qris') {
    return <QRISPaymentScreen {...props} />;
  }
  return <CashPaymentScreen {...props} />;
}

// ─── COMPLETED ────────────────────────────────────────────────────────────────
function CompletedScreen(props: {
  tenantName: string; orderNumber: string;
  total: number; amountPaid: number; change: number;
  items: CFDItem[]; subtotal: number; tax: number; serviceCharge: number;
  customerName?: string;
}) {
  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-green-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LogoBadge name={props.tenantName} size="sm" />
          <p className="font-bold text-white text-sm">{props.tenantName}</p>
        </div>
        <span className="text-xs font-bold text-green-100 bg-green-700 rounded-xl px-3 py-1.5">
          Order #{props.orderNumber}
        </span>
      </div>

      <div className="flex-1 flex flex-col md:flex-row items-stretch overflow-auto">
        {/* Success badge */}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
          <div
            className="bg-white rounded-3xl border border-slate-200 shadow-lg px-8 py-8 flex flex-col items-center gap-5 w-full max-w-sm"
            style={{ animation: 'fadeUp .4s ease both' }}
          >
            <div
              className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-100"
              style={{ animation: 'popIn .5s cubic-bezier(.175,.885,.32,1.275) .1s both' }}
            >
              <CheckCircle2 size={40} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-xl font-black text-green-600">Pembayaran Berhasil!</p>
              <p className="text-4xl md:text-5xl font-black text-slate-800 tabular-nums">{fmt(props.total)}</p>
            </div>

            {props.amountPaid > 0 && (
              <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between text-sm text-slate-500">
                  <span>Dibayar</span>
                  <span className="font-semibold tabular-nums">{fmt(props.amountPaid)}</span>
                </div>
                {props.change > 0 && (
                  <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
                    <span className="font-bold text-slate-700">Kembalian</span>
                    <span className="font-black text-green-600 tabular-nums text-lg">{fmt(props.change)}</span>
                  </div>
                )}
              </div>
            )}

            <p className="text-base font-semibold text-slate-500 text-center">
              Terima kasih telah berkunjung! 🙏
            </p>
            {props.customerName && (
              <p className="text-sm text-slate-400">Sampai jumpa, <strong>{props.customerName}</strong>!</p>
            )}
          </div>
        </div>

        {/* Receipt */}
        <div className="md:w-64 flex-shrink-0 border-t md:border-t-0 md:border-l border-slate-200 bg-white p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Struk</p>
          <div className="bg-slate-50 rounded-xl overflow-hidden mb-4">
            {props.items.map((item, i) => (
              <ItemRow key={item.id} item={item} idx={i} />
            ))}
          </div>
          <SummaryLines subtotal={props.subtotal} tax={props.tax} serviceCharge={props.serviceCharge} total={props.total} />
          {props.amountPaid > 0 && (
            <div className="mt-3 pt-3 border-t border-dashed border-slate-200 space-y-1">
              <div className="flex justify-between text-sm text-slate-500">
                <span>Dibayar</span>
                <span className="font-semibold">{fmt(props.amountPaid)}</span>
              </div>
              {props.change > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-slate-700">Kembalian</span>
                  <span className="font-black text-green-600">{fmt(props.change)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function CustomerDisplayPage() {
  const [msg, setMsg] = useState<CFDMessage>({ type: 'idle', tenantName: 'AuraPOS' });

  useCustomerDisplayReceiver((m) => {
    if (m.type !== 'ping') setMsg(m);
  });

  const tenantName = msg.type !== 'ping' && 'tenantName' in msg ? msg.tenantName : 'AuraPOS';

  return (
    <>
      <style>{`
        @keyframes slideIn { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:none} }
        @keyframes popIn   { from{opacity:0;transform:scale(.4)} to{opacity:1;transform:scale(1)} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
        @keyframes orb1    { 0%,100%{transform:translate(0,0) scale(1)} 40%{transform:translate(5%,8%) scale(1.1)} 70%{transform:translate(-3%,4%) scale(.95)} }
        @keyframes orb2    { 0%,100%{transform:translate(0,0) scale(1)} 35%{transform:translate(-6%,-5%) scale(1.08)} 65%{transform:translate(4%,-8%) scale(.92)} }
        @keyframes orb3    { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-8%,6%) scale(1.15)} }
        body { overflow:hidden; }
      `}</style>
      <div className="w-screen h-screen flex flex-col bg-slate-50 overflow-hidden">
        {msg.type === 'idle' && (
          <IdleScreen tenantName={tenantName} />
        )}
        {msg.type === 'ordering' && (
          <OrderingScreen {...msg} />
        )}
        {msg.type === 'payment' && (
          <PaymentScreen {...msg} />
        )}
        {msg.type === 'completed' && (
          <CompletedScreen {...msg} />
        )}
      </div>
    </>
  );
}
