/**
 * Customer Facing Display (CFD)
 * Tampilan untuk layar yang menghadap pelanggan.
 *
 * Layout per state:
 * - idle:     Slideshow promo / welcome
 * - ordering: Item grid 2-col (compact) | Panel summary + total besar
 * - payment:  QRIS → QR code besar + total | Non-QRIS → total + metode
 * - completed: Checkmark + total + kembalian
 */

import { useState, useEffect, useRef } from 'react';
import { ShoppingCart, CheckCircle2 } from 'lucide-react';
import {
  useCustomerDisplayReceiver,
  type CFDMessage,
  type CFDItem,
} from '@/hooks/useCustomerDisplay';

const fmt = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n);

// ─── Live clock ───────────────────────────────────────────────────────────────
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── Logo badge ───────────────────────────────────────────────────────────────
function LogoBadge({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.slice(0, 2).toUpperCase();
  const cls =
    size === 'lg'
      ? 'w-20 h-20 rounded-3xl text-2xl shadow-2xl shadow-blue-200'
      : size === 'sm'
      ? 'w-8 h-8 rounded-xl text-[11px]'
      : 'w-11 h-11 rounded-2xl text-sm';
  return (
    <div
      className={`${cls} bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0`}
    >
      <span className="font-black text-white tracking-tight select-none">{initials}</span>
    </div>
  );
}

// ─── Animated total number ─────────────────────────────────────────────────────
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
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className={className}>{fmt(display)}</span>;
}

// ─── Top bar shared ────────────────────────────────────────────────────────────
function TopBar({
  tenantName,
  orderNumber,
  badgeColor = 'blue',
  textOverride,
}: {
  tenantName: string;
  orderNumber?: string;
  badgeColor?: 'blue' | 'amber' | 'green' | 'white';
  textOverride?: string;
}) {
  const badgeCls = {
    blue: 'bg-blue-50 border-blue-100 text-blue-600',
    amber: 'bg-amber-50 border-amber-100 text-amber-600',
    green: 'bg-green-700 text-green-100',
    white: 'bg-white/20 text-white',
  }[badgeColor];

  const barBg = badgeColor === 'green' ? 'bg-green-600' : 'bg-white border-b border-slate-200';
  const nameColor = badgeColor === 'green' ? 'text-white' : 'text-slate-800';

  return (
    <div className={`flex-shrink-0 px-5 py-3 flex items-center justify-between ${barBg}`}>
      <div className="flex items-center gap-3">
        <LogoBadge name={tenantName} size="sm" />
        <span className={`font-bold text-sm ${nameColor}`}>{tenantName}</span>
      </div>
      {orderNumber && (
        <span className={`text-xs font-bold border rounded-xl px-3 py-1.5 ${badgeCls}`}>
          {textOverride ?? `Order #${orderNumber}`}
        </span>
      )}
    </div>
  );
}

// ─── Compact item row (single-line, for 2-col grid) ───────────────────────────
function CompactItemRow({ item }: { item: CFDItem }) {
  const subtitle = [item.variantName, item.optionsSummary].filter(Boolean).join(' · ');
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-0">
      <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-[11px] font-black text-blue-600">
        {item.quantity}×
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 text-xs leading-tight truncate">{item.name}</p>
        {subtitle && (
          <p className="text-[10px] text-slate-400 leading-tight truncate">{subtitle}</p>
        )}
      </div>
      <span className="flex-shrink-0 text-xs font-bold text-slate-700 tabular-nums">
        {fmt(item.itemTotal)}
      </span>
    </div>
  );
}

// ─── Summary panel (right side) — total FIRST, always visible ─────────────────
function SummaryPanel({
  subtotal,
  tax,
  serviceCharge,
  total,
  itemCount,
  accentBg = 'bg-blue-600',
}: {
  subtotal: number;
  tax: number;
  serviceCharge: number;
  total: number;
  itemCount: number;
  accentBg?: string;
}) {
  return (
    <div className="flex flex-col h-full gap-4">
      {/* ── TOTAL — top, full-width, unmissable ── */}
      <div className={`${accentBg} rounded-2xl px-5 py-5 flex flex-col gap-1`}>
        <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Total Tagihan</p>
        <AnimatedTotal value={total} className="text-4xl font-black tabular-nums text-white leading-tight" />
        {itemCount > 0 && (
          <p className="text-xs text-white/50 font-medium mt-0.5">{itemCount} item</p>
        )}
      </div>

      {/* ── Breakdown ── */}
      <div className="space-y-2.5">
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
      </div>
    </div>
  );
}

// ─── IDLE ─────────────────────────────────────────────────────────────────────
type Slide = {
  id: string;
  bg: string;
  headline: string;
  sub?: string;
  label?: string;
  badge?: string;
  badgeBg?: string;
  isDark?: boolean;
};

const DEFAULT_SLIDES: Slide[] = [
  {
    id: 'welcome',
    bg: 'bg-white',
    headline: 'Selamat\nDatang',
    sub: 'Terima kasih telah berkunjung',
  },
  {
    id: 'promo1',
    bg: 'bg-blue-600',
    headline: 'Diskon\n20%',
    label: 'Promo Hari Ini',
    sub: 'Untuk semua minuman pilihan',
    badge: 'Terbatas',
    badgeBg: 'bg-white/20',
    isDark: true,
  },
  {
    id: 'promo2',
    bg: 'bg-slate-900',
    headline: 'Beli 2\nGratis 1',
    label: 'Spesial Weekend',
    sub: 'Berlaku setiap Sabtu & Minggu',
    badge: 'Weekend Only',
    badgeBg: 'bg-blue-600',
    isDark: true,
  },
  {
    id: 'loyalty',
    bg: 'bg-slate-50',
    headline: 'Kumpulkan\nPoin',
    label: 'Program Loyalitas',
    sub: 'Setiap transaksi = poin reward',
  },
];

function IdleScreen({ tenantName }: { tenantName: string }) {
  const now = useClock();
  const [activeIdx, setActiveIdx] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setActiveIdx((i) => (i + 1) % DEFAULT_SLIDES.length);
        setFading(false);
      }, 350);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const slide = DEFAULT_SLIDES[activeIdx];
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const initials = tenantName.slice(0, 2).toUpperCase();
  const headlineColor = slide.isDark ? 'text-white' : 'text-slate-900';
  const subColor = slide.isDark ? 'text-white/60' : 'text-slate-400';
  const labelColor = slide.isDark ? 'text-white/40' : 'text-blue-600';

  return (
    <div className="flex-1 flex flex-col overflow-hidden select-none">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-7 py-4 bg-white border-b border-slate-100 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
            <span className="text-[11px] font-black text-white">{initials}</span>
          </div>
          <span className="font-bold text-slate-700 text-sm">{tenantName}</span>
        </div>
        <div className="text-right">
          <p className="text-xl font-black text-slate-800 tabular-nums leading-none">{timeStr}</p>
          <p className="text-[11px] text-slate-400 font-medium capitalize mt-0.5">{dateStr}</p>
        </div>
      </div>

      {/* Slide */}
      <div
        className={`flex-1 flex flex-col items-center justify-center px-12 transition-opacity duration-300 ${slide.bg} ${fading ? 'opacity-0' : 'opacity-100'}`}
      >
        <div className="w-full max-w-2xl flex flex-col gap-4">
          {slide.label && (
            <p className={`text-xs font-bold tracking-[0.18em] uppercase ${labelColor}`}>
              {slide.label}
            </p>
          )}
          <h2
            className={`font-black leading-[0.95] tracking-tighter ${headlineColor}`}
            style={{ fontSize: 'clamp(3.5rem,10vw,7rem)', whiteSpace: 'pre-line' }}
          >
            {slide.headline}
          </h2>
          {slide.sub && <p className={`font-medium text-lg ${subColor}`}>{slide.sub}</p>}
          {slide.badge && (
            <span
              className={`self-start text-xs font-bold text-white px-3 py-1.5 rounded-full tracking-wide ${slide.badgeBg}`}
            >
              {slide.badge}
            </span>
          )}
        </div>
      </div>

      {/* Bottom dots */}
      <div className="flex-shrink-0 flex items-center justify-between px-7 py-4 bg-white border-t border-slate-100">
        <div className="flex items-center gap-2">
          {DEFAULT_SLIDES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => {
                setFading(true);
                setTimeout(() => {
                  setActiveIdx(i);
                  setFading(false);
                }, 350);
              }}
              className={`rounded-full transition-all duration-300 ${i === activeIdx ? 'w-5 h-2 bg-blue-600' : 'w-2 h-2 bg-slate-200'}`}
            />
          ))}
        </div>
        <span className="text-[11px] text-slate-300 font-medium tracking-widest uppercase">
          Powered by AuraPOS
        </span>
      </div>
    </div>
  );
}

// ─── ORDERING ─────────────────────────────────────────────────────────────────
function OrderingScreen(props: {
  tenantName: string;
  orderNumber: string;
  items: CFDItem[];
  subtotal: number;
  tax: number;
  serviceCharge: number;
  total: number;
  customerName?: string;
  tableNumber?: string;
}) {
  const itemCount = props.items.reduce((s, i) => s + i.quantity, 0);

  // Group items by category
  const grouped = props.items.reduce<Record<string, CFDItem[]>>((acc, item) => {
    const cat = item.category || 'Lainnya';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
  const categories = Object.keys(grouped);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <TopBar tenantName={props.tenantName} orderNumber={props.orderNumber} badgeColor="blue" />

      {/* Customer info strip */}
      {(props.customerName || props.tableNumber) && (
        <div className="flex-shrink-0 bg-blue-50 border-b border-blue-100 px-5 py-2 flex items-center gap-3">
          {props.tableNumber && (
            <span className="text-xs font-bold text-blue-600 bg-white border border-blue-200 rounded-lg px-2 py-0.5">
              Meja {props.tableNumber}
            </span>
          )}
          {props.customerName && (
            <span className="text-xs font-semibold text-blue-700">{props.customerName}</span>
          )}
        </div>
      )}

      {/* Main body: items left | summary right */}
      <div className="flex-1 flex min-h-0">

        {/* Items — grouped by category, 2 columns of category cards */}
        <div className="flex-1 p-4 min-w-0 overflow-hidden">
          {props.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 text-slate-300 h-full">
              <ShoppingCart size={36} />
              <p className="text-sm font-medium">Menambahkan item…</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 content-start h-full">
              {categories.map((cat) => (
                <div key={cat} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden self-start">
                  {/* Category header */}
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{cat}</span>
                  </div>
                  {/* Items in this category */}
                  {grouped[cat].map((item) => (
                    <CompactItemRow key={item.id} item={item} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary panel — right, total always at top */}
        <div className="flex-shrink-0 w-72 border-l border-slate-200 bg-white p-5 overflow-hidden">
          <SummaryPanel
            subtotal={props.subtotal}
            tax={props.tax}
            serviceCharge={props.serviceCharge}
            total={props.total}
            itemCount={itemCount}
            accentBg="bg-blue-600"
          />
        </div>
      </div>
    </div>
  );
}

// ─── PAYMENT — QRIS ───────────────────────────────────────────────────────────
function QRISPaymentScreen(props: {
  tenantName: string;
  orderNumber: string;
  total: number;
  subtotal: number;
  tax: number;
  serviceCharge: number;
}) {
  const qrData = `AURAPOS-QRIS-${props.orderNumber}-${props.total}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}&qzone=2&color=000000&bgcolor=ffffff&format=png`;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <TopBar tenantName={props.tenantName} orderNumber={props.orderNumber} badgeColor="amber" />

      <div className="flex-1 flex min-h-0">
        {/* QR code — center focus */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
          {/* Instruction */}
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">
            Scan QRIS untuk Membayar
          </p>

          {/* QR code box */}
          <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-xl p-6 flex flex-col items-center gap-5">
            <div className="w-64 h-64 bg-white rounded-2xl overflow-hidden flex items-center justify-center">
              <img
                src={qrUrl}
                alt="QRIS QR Code"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>

            {/* Total below QR */}
            <div className="text-center">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                Total Pembayaran
              </p>
              <p className="text-5xl font-black text-slate-900 tabular-nums">{fmt(props.total)}</p>
            </div>

            {/* Supported wallets */}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {['GoPay', 'OVO', 'Dana', 'LinkAja', 'ShopeePay', 'BCA Mobile'].map((app) => (
                <span
                  key={app}
                  className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full"
                >
                  {app}
                </span>
              ))}
            </div>
          </div>

          {/* Waiting indicator */}
          <div className="flex items-center gap-2 text-amber-600">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-sm font-semibold">Menunggu konfirmasi pembayaran…</p>
          </div>
        </div>

        {/* Summary panel — right */}
        <div className="flex-shrink-0 w-72 border-l border-slate-200 bg-white p-6 overflow-hidden">
          <SummaryPanel
            subtotal={props.subtotal}
            tax={props.tax}
            serviceCharge={props.serviceCharge}
            total={props.total}
            itemCount={0}
            accentBg="bg-amber-500"
          />
        </div>
      </div>
    </div>
  );
}

// ─── PAYMENT — non-QRIS ────────────────────────────────────────────────────────
const METHOD_LABELS: Record<string, string> = {
  cash: 'Tunai',
  card: 'Kartu Debit / Kredit',
  qris: 'QRIS',
  transfer: 'Transfer Bank',
  ewallet: 'E-Wallet',
};
const METHOD_EMOJI: Record<string, string> = {
  cash: '💵',
  card: '💳',
  qris: '📱',
  transfer: '🏦',
  ewallet: '📲',
};
const METHOD_COLOR: Record<string, string> = {
  cash: 'bg-green-50 border-green-100 text-green-700',
  card: 'bg-purple-50 border-purple-100 text-purple-700',
  transfer: 'bg-blue-50 border-blue-100 text-blue-700',
  ewallet: 'bg-pink-50 border-pink-100 text-pink-700',
};

function CashPaymentScreen(props: {
  tenantName: string;
  orderNumber: string;
  total: number;
  method: string;
  subtotal: number;
  tax: number;
  serviceCharge: number;
}) {
  const colorClass = METHOD_COLOR[props.method] ?? 'bg-slate-50 border-slate-200 text-slate-700';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <TopBar tenantName={props.tenantName} orderNumber={props.orderNumber} badgeColor="amber" />

      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl px-12 py-10 flex flex-col items-center gap-6 w-full max-w-md">
          {/* Method badge */}
          <div className={`rounded-2xl border px-6 py-3 flex items-center gap-3 ${colorClass}`}>
            <span className="text-3xl">{METHOD_EMOJI[props.method] ?? '💰'}</span>
            <span className="text-lg font-bold">{METHOD_LABELS[props.method] ?? props.method}</span>
          </div>

          {/* Total */}
          <div className="text-center">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">
              Total Pembayaran
            </p>
            <p className="text-6xl font-black text-slate-900 tabular-nums">{fmt(props.total)}</p>
          </div>

          {/* Breakdown */}
          <div className="w-full bg-slate-50 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Subtotal</span>
              <span className="font-semibold tabular-nums">{fmt(props.subtotal)}</span>
            </div>
            {props.serviceCharge > 0 && (
              <div className="flex justify-between text-sm text-slate-500">
                <span>Service Charge</span>
                <span className="font-semibold tabular-nums">{fmt(props.serviceCharge)}</span>
              </div>
            )}
            {props.tax > 0 && (
              <div className="flex justify-between text-sm text-slate-500">
                <span>Pajak</span>
                <span className="font-semibold tabular-nums">{fmt(props.tax)}</span>
              </div>
            )}
          </div>

          {/* Processing spinner */}
          <div className="flex items-center gap-3 text-slate-400">
            <div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
            <p className="text-sm font-medium">Mohon tunggu, kasir sedang memproses…</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentScreen(props: {
  tenantName: string;
  orderNumber: string;
  total: number;
  method: string;
  items: CFDItem[];
  subtotal: number;
  tax: number;
  serviceCharge: number;
  customerName?: string;
  tableNumber?: string;
}) {
  if (props.method === 'qris' || props.method === 'ewallet') {
    return <QRISPaymentScreen {...props} />;
  }
  return <CashPaymentScreen {...props} />;
}

// ─── COMPLETED ─────────────────────────────────────────────────────────────────
function CompletedScreen(props: {
  tenantName: string;
  orderNumber: string;
  total: number;
  amountPaid: number;
  change: number;
  customerName?: string;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TopBar
        tenantName={props.tenantName}
        orderNumber={props.orderNumber}
        badgeColor="green"
        textOverride={`Order #${props.orderNumber}`}
      />

      <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-green-50 to-white p-8 gap-6">
        <div
          className="bg-white rounded-3xl border border-slate-200 shadow-xl px-12 py-10 flex flex-col items-center gap-6 w-full max-w-lg"
          style={{ animation: 'fadeUp .4s ease both' }}
        >
          {/* Checkmark */}
          <div
            className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center shadow-xl shadow-green-100"
            style={{ animation: 'popIn .5s cubic-bezier(.175,.885,.32,1.275) .1s both' }}
          >
            <CheckCircle2 size={48} className="text-white" strokeWidth={2.5} />
          </div>

          {/* Title */}
          <div className="text-center">
            <p className="text-2xl font-black text-green-600 mb-2">Pembayaran Berhasil!</p>
            <p className="text-6xl font-black text-slate-900 tabular-nums">{fmt(props.total)}</p>
          </div>

          {/* Dibayar + kembalian */}
          {props.amountPaid > 0 && (
            <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex justify-between text-base text-slate-500">
                <span>Dibayar</span>
                <span className="font-semibold tabular-nums">{fmt(props.amountPaid)}</span>
              </div>
              {props.change > 0 && (
                <div className="flex justify-between items-center border-t border-slate-200 pt-3">
                  <span className="font-bold text-slate-700 text-lg">Kembalian</span>
                  <span className="font-black text-green-600 tabular-nums text-3xl">
                    {fmt(props.change)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Thank you */}
          <div className="text-center">
            <p className="text-xl font-semibold text-slate-500">Terima kasih telah berkunjung! 🙏</p>
            {props.customerName && (
              <p className="text-base text-slate-400 mt-1">
                Sampai jumpa, <strong className="text-slate-600">{props.customerName}</strong>!
              </p>
            )}
          </div>
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
        @keyframes popIn  { from{opacity:0;transform:scale(.4)} to{opacity:1;transform:scale(1)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
        body { overflow:hidden; }
      `}</style>
      <div className="w-screen h-screen flex flex-col bg-slate-50 overflow-hidden">
        {msg.type === 'idle' && <IdleScreen tenantName={tenantName} />}
        {msg.type === 'ordering' && <OrderingScreen {...msg} />}
        {msg.type === 'payment' && <PaymentScreen {...msg} />}
        {msg.type === 'completed' && <CompletedScreen {...msg} />}
      </div>
    </>
  );
}
