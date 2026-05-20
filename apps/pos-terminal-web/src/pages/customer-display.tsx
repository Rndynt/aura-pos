/**
 * Customer Facing Display (CFD) — AuraPOS
 */

import { useState, useEffect, useRef } from 'react';
import { ShoppingCart, CheckCircle2, Clock } from 'lucide-react';
import {
  useCustomerDisplayReceiver,
  type CFDMessage,
  type CFDItem,
} from '@/hooks/useCustomerDisplay';
import { getActiveTenantId } from '@/lib/tenant';

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

// ─── PAYMENT — QRIS ───────────────────────────────────────────────────────────
function QRISPaymentScreen(props: {
  tenantName: string; orderNumber: string; total: number;
  subtotal: number; tax: number; serviceCharge: number;
}) {
  const qrData = `AURAPOS-QRIS-${props.orderNumber}-${props.total}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qrData)}&qzone=2&color=000000&bgcolor=ffffff&format=png`;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm shadow-blue-200">
            <span className="text-xs font-black text-white">{props.tenantName.slice(0,2).toUpperCase()}</span>
          </div>
          <span className="font-bold text-slate-800 text-sm">{props.tenantName}</span>
        </div>
        <span className="text-xs font-bold bg-amber-50 border border-amber-100 text-amber-600 rounded-xl px-3 py-1.5">
          Order #{props.orderNumber}
        </span>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Scan QRIS untuk Membayar</p>
          <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200 border border-slate-200 p-7 flex flex-col items-center gap-5">
            <div className="w-64 h-64 rounded-2xl overflow-hidden border border-slate-100">
              <img src={qrUrl} alt="QRIS" className="w-full h-full object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <div className="w-full text-center border-t border-dashed border-slate-200 pt-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Total Pembayaran</p>
              <p className="text-4xl font-black text-slate-900 tabular-nums">{fmt(props.total)}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {['GoPay','OVO','Dana','LinkAja','ShopeePay','BCA Mobile'].map(app => (
                <span key={app} className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{app}</span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 text-amber-600">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-sm font-semibold">Menunggu konfirmasi pembayaran…</p>
          </div>
        </div>

        <div className="flex-shrink-0 w-72 border-l border-slate-200 bg-white flex flex-col">
          <div className="bg-amber-500 px-6 py-6">
            <p className="text-[11px] font-bold text-amber-100 uppercase tracking-widest mb-1">Total Tagihan</p>
            <p className="text-[2.4rem] font-black text-white tabular-nums leading-tight">{fmt(props.total)}</p>
          </div>
          <div className="flex-1 px-6 py-5 space-y-3">
            <div className="flex justify-between text-sm"><span className="text-slate-400">Subtotal</span><span className="font-semibold text-slate-700 tabular-nums">{fmt(props.subtotal)}</span></div>
            {props.serviceCharge > 0 && <div className="flex justify-between text-sm"><span className="text-slate-400">Service Charge</span><span className="font-semibold text-slate-700 tabular-nums">{fmt(props.serviceCharge)}</span></div>}
            {props.tax > 0 && <div className="flex justify-between text-sm"><span className="text-slate-400">Pajak</span><span className="font-semibold text-slate-700 tabular-nums">{fmt(props.tax)}</span></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PAYMENT — non-QRIS ───────────────────────────────────────────────────────
const METHOD_LABEL: Record<string, string> = { cash:'Tunai', card:'Kartu Debit/Kredit', transfer:'Transfer Bank', ewallet:'E-Wallet' };
const METHOD_EMOJI: Record<string, string> = { cash:'💵', card:'💳', transfer:'🏦', ewallet:'📲' };

function CashPaymentScreen(props: {
  tenantName: string; orderNumber: string; total: number; method: string;
  subtotal: number; tax: number; serviceCharge: number;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
            <span className="text-xs font-black text-white">{props.tenantName.slice(0,2).toUpperCase()}</span>
          </div>
          <span className="font-bold text-slate-800 text-sm">{props.tenantName}</span>
        </div>
        <span className="text-xs font-bold bg-amber-50 border border-amber-100 text-amber-600 rounded-xl px-3 py-1.5">
          Order #{props.orderNumber}
        </span>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-100 p-10 flex flex-col items-center gap-7 w-full max-w-md">
          <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-4xl">
            {METHOD_EMOJI[props.method] ?? '💰'}
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">{METHOD_LABEL[props.method] ?? props.method}</p>
            <p className="font-black text-slate-900 tabular-nums" style={{ fontSize: 'clamp(2.5rem,7vw,4.5rem)' }}>{fmt(props.total)}</p>
          </div>
          <div className="w-full bg-slate-50 rounded-2xl px-5 py-4 space-y-2.5">
            <div className="flex justify-between text-sm text-slate-500"><span>Subtotal</span><span className="font-semibold tabular-nums">{fmt(props.subtotal)}</span></div>
            {props.serviceCharge > 0 && <div className="flex justify-between text-sm text-slate-500"><span>Service Charge</span><span className="font-semibold tabular-nums">{fmt(props.serviceCharge)}</span></div>}
            {props.tax > 0 && <div className="flex justify-between text-sm text-slate-500"><span>Pajak</span><span className="font-semibold tabular-nums">{fmt(props.tax)}</span></div>}
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <div className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin flex-shrink-0" />
            <p className="text-sm font-medium">Kasir sedang memproses pembayaran…</p>
          </div>
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
  if (props.method === 'qris' || props.method === 'ewallet') return <QRISPaymentScreen {...props} />;
  return <CashPaymentScreen {...props} />;
}

// ─── COMPLETED SCREEN ─────────────────────────────────────────────────────────
function CompletedScreen(props: {
  tenantName: string; orderNumber: string;
  total: number; amountPaid: number; change: number; customerName?: string;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-emerald-600 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <span className="text-xs font-black text-white">{props.tenantName.slice(0,2).toUpperCase()}</span>
          </div>
          <span className="font-bold text-white text-sm">{props.tenantName}</span>
        </div>
        <span className="text-xs font-bold bg-emerald-700 text-emerald-100 rounded-xl px-3 py-1.5">
          Order #{props.orderNumber}
        </span>
      </div>

      <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-emerald-50 to-white p-8">
        <div
          className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-100 px-12 py-10 flex flex-col items-center gap-7 w-full max-w-lg"
          style={{ animation: 'fadeUp .4s ease both' }}
        >
          <div
            className="w-24 h-24 rounded-full bg-emerald-500 flex items-center justify-center shadow-xl shadow-emerald-100"
            style={{ animation: 'popIn .5s cubic-bezier(.175,.885,.32,1.275) .1s both' }}
          >
            <CheckCircle2 size={50} className="text-white" strokeWidth={2.5} />
          </div>

          <div className="text-center">
            <p className="text-2xl font-black text-emerald-600 mb-2">Pembayaran Berhasil!</p>
            <p className="font-black text-slate-900 tabular-nums" style={{ fontSize: 'clamp(2.8rem,8vw,5rem)' }}>
              {fmt(props.total)}
            </p>
          </div>

          {props.amountPaid > 0 && (
            <div className="w-full rounded-2xl border border-slate-200 overflow-hidden">
              <div className="flex justify-between px-5 py-3 bg-slate-50 text-sm">
                <span className="text-slate-500">Dibayar</span>
                <span className="font-semibold text-slate-700 tabular-nums">{fmt(props.amountPaid)}</span>
              </div>
              {props.change > 0 && (
                <div className="flex justify-between items-center px-5 py-4 border-t border-slate-200">
                  <span className="font-bold text-slate-700 text-base">Kembalian</span>
                  <span className="font-black text-emerald-600 tabular-nums text-3xl">{fmt(props.change)}</span>
                </div>
              )}
            </div>
          )}

          <div className="text-center">
            <p className="text-lg font-semibold text-slate-500">Terima kasih telah berkunjung 🙏</p>
            {props.customerName && (
              <p className="text-sm text-slate-400 mt-1">Sampai jumpa, <strong className="text-slate-600">{props.customerName}</strong>!</p>
            )}
          </div>
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
    e.stopPropagation(); // jangan trigger fullscreen
    navigator.clipboard.writeText(cfdUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div
      onClick={onEnter}
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 cursor-pointer select-none"
      style={{ background: 'rgba(2,6,23,0.82)', backdropFilter: 'blur(8px)', animation: 'fadeUp .3s ease both' }}
    >
      {/* Icon */}
      <div className="w-20 h-20 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
          <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
        </svg>
      </div>
      <div className="text-center">
        <p className="text-white font-bold text-xl mb-1">Tap untuk Fullscreen</p>
        <p className="text-white/50 text-sm">Layar akan terkunci landscape otomatis</p>
      </div>

      {/* Link siap share ke device lain */}
      <div
        onClick={handleCopy}
        className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 hover:bg-white/15 transition-colors cursor-pointer"
        title="Klik untuk copy link"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400 flex-shrink-0">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
        </svg>
        <span className="text-white/50 text-[11px] font-mono truncate max-w-[280px]">{cfdUrl}</span>
        <span className={`text-[10px] font-semibold flex-shrink-0 transition-colors ${copied ? 'text-emerald-400' : 'text-blue-400'}`}>
          {copied ? 'Tersalin!' : 'Copy'}
        </span>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/15">
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
        <span className="text-white/60 text-xs font-medium">Customer Display siap • buka link di device lain</span>
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
  const [showPrompt, setShowPrompt] = useState(true);
  const { isFullscreen, enter } = useFullscreen();

  // Ambil tenantId dari URL (?tenantId=xxx) agar Device B tanpa login bisa sync
  const tenantIdFromUrl = new URLSearchParams(window.location.search).get('tenantId') ?? undefined;

  useCustomerDisplayReceiver((m) => { if (m.type !== 'ping') setMsg(m); }, tenantIdFromUrl);
  const tenantName = msg.type !== 'ping' && 'tenantName' in msg ? msg.tenantName : 'AuraPOS';

  // Bangun link CFD yang mengandung tenantId — ini yang di-share ke Device B
  // Priority: ?tenantId dari URL  >  active session (localStorage setelah login)
  const cfdUrl = (() => {
    const base = `${window.location.origin}/display`;
    const tid = tenantIdFromUrl || getActiveTenantId();
    return tid ? `${base}?tenantId=${encodeURIComponent(tid)}` : base;
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

        {/* Fullscreen prompt — tampil saat pertama buka */}
        {showPrompt && <FullscreenPrompt onEnter={handleEnterFullscreen} cfdUrl={cfdUrl} />}

        {/* Tombol fullscreen kecil — muncul saat kursor gerak, tidak fullscreen */}
        {!isFullscreen && !showPrompt && <FullscreenButton onClick={enter} />}
      </div>
    </>
  );
}
