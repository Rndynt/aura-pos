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

// ─── Formatter ────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

// ─── Live clock ───────────────────────────────────────────────────────────────
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── Animated number ──────────────────────────────────────────────────────────
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
  return <span className={className} style={style}>{fmt(display)}</span>;
}

// ─── IDLE ─────────────────────────────────────────────────────────────────────
type Slide = { id: string; bg: string; headline: string; sub?: string; label?: string; badge?: string; badgeBg?: string; dark?: boolean };
const SLIDES: Slide[] = [
  { id: 'welcome', bg: 'bg-white', headline: 'Selamat\nDatang', sub: 'Terima kasih telah berkunjung' },
  { id: 'promo1', bg: 'bg-blue-600', headline: 'Diskon\n20%', label: 'Promo Hari Ini', sub: 'Untuk semua minuman pilihan', badge: 'Terbatas', badgeBg: 'bg-white/20', dark: true },
  { id: 'promo2', bg: 'bg-slate-900', headline: 'Beli 2\nGratis 1', label: 'Spesial Weekend', sub: 'Berlaku setiap Sabtu & Minggu', badge: 'Weekend Only', badgeBg: 'bg-blue-600', dark: true },
  { id: 'loyalty', bg: 'bg-slate-50', headline: 'Kumpulkan\nPoin', label: 'Program Loyalitas', sub: 'Setiap transaksi = poin reward' },
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
      {/* Top bar */}
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

      {/* Slide */}
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

      {/* Bottom */}
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

// ─── ORDERING ─────────────────────────────────────────────────────────────────
function OrderingScreen(props: {
  tenantName: string; orderNumber: string; items: CFDItem[];
  subtotal: number; tax: number; serviceCharge: number; total: number;
  customerName?: string; tableNumber?: string;
}) {
  const itemCount = props.items.reduce((s, i) => s + i.quantity, 0);

  // Format total: split "Rp " prefix from number so the big display never clips
  const totalFormatted = fmt(props.total); // "Rp 6.369.850"
  const totalNumber = totalFormatted.replace(/^Rp\s*/, ''); // "6.369.850"

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">

      {/* ── LEFT: Item list ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white">

        {/* Topbar */}
        <div className="flex-shrink-0 bg-slate-900 h-11 px-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center">
              <span className="text-[9px] font-black text-white leading-none">{props.tenantName.slice(0,2).toUpperCase()}</span>
            </div>
            <span className="text-sm font-semibold text-white">{props.tenantName}</span>
            {props.tableNumber && (
              <>
                <span className="text-slate-600 text-xs">·</span>
                <span className="text-xs font-semibold text-slate-300">Meja {props.tableNumber}</span>
              </>
            )}
            {props.customerName && (
              <>
                <span className="text-slate-600 text-xs">·</span>
                <span className="text-xs text-slate-400">{props.customerName}</span>
              </>
            )}
          </div>
          <span className="text-xs text-slate-500 font-medium">#{props.orderNumber}</span>
        </div>

        {/* Column headers */}
        <div className="flex-shrink-0 flex items-center gap-3 px-5 py-2 bg-slate-50 border-b border-slate-200">
          <span className="w-8 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Qty</span>
          <span className="flex-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Item</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subtotal</span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-hidden">
          {props.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 text-slate-300 h-full">
              <ShoppingCart size={32} strokeWidth={1.5} />
              <p className="text-sm">Menambahkan item…</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {props.items.map((item) => {
                const sub = [item.variantName, item.optionsSummary].filter(Boolean).join(', ');
                return (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="flex-shrink-0 w-8 text-right text-sm font-bold text-slate-500 tabular-nums">
                      {item.quantity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                      {sub && <p className="text-xs text-slate-400 truncate mt-0.5">{sub}</p>}
                    </div>
                    <span className="flex-shrink-0 text-sm font-semibold text-slate-700 tabular-nums">
                      {fmt(item.itemTotal)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Total panel — full height, solid blue ── */}
      <div className="flex-shrink-0 w-80 bg-blue-600 flex flex-col overflow-hidden">

        {/* Filler top (topbar height match) */}
        <div className="flex-shrink-0 h-11 bg-blue-700 px-5 flex items-center">
          <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">Total Tagihan</span>
        </div>

        {/* Big total — centered vertically */}
        <div className="flex-1 flex flex-col items-start justify-center px-7">
          <span className="text-sm font-semibold text-blue-300 mb-1">Rp</span>
          <AnimatedTotal
            value={props.total}
            className="font-black text-white tabular-nums leading-none"
            style={{ fontSize: 'clamp(1.75rem, 5vw, 2.75rem)', wordBreak: 'break-all' }}
          />
          <span className="text-sm text-blue-300 font-medium mt-3">{itemCount} item</span>
        </div>

        {/* Breakdown — bottom */}
        <div className="flex-shrink-0 border-t border-blue-500 px-7 py-5 space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-blue-300">Subtotal</span>
            <span className="font-semibold text-white tabular-nums">{fmt(props.subtotal)}</span>
          </div>
          {props.serviceCharge > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-blue-300">Service Charge</span>
              <span className="font-semibold text-white tabular-nums">{fmt(props.serviceCharge)}</span>
            </div>
          )}
          {props.tax > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-blue-300">Pajak</span>
              <span className="font-semibold text-white tabular-nums">{fmt(props.tax)}</span>
            </div>
          )}
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
      {/* Header */}
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
        {/* QR section */}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Scan QRIS untuk Membayar</p>

          <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200 border border-slate-200 p-7 flex flex-col items-center gap-5">
            {/* QR */}
            <div className="w-64 h-64 rounded-2xl overflow-hidden border border-slate-100">
              <img src={qrUrl} alt="QRIS" className="w-full h-full object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>

            {/* Total under QR */}
            <div className="w-full text-center border-t border-dashed border-slate-200 pt-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Total Pembayaran</p>
              <p className="text-4xl font-black text-slate-900 tabular-nums">{fmt(props.total)}</p>
            </div>

            {/* Wallets */}
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

        {/* Summary panel */}
        <div className="flex-shrink-0 w-72 border-l border-slate-200 bg-white flex flex-col">
          <div className="bg-amber-500 px-6 py-6">
            <p className="text-[11px] font-bold text-amber-100 uppercase tracking-widest mb-1">Total Tagihan</p>
            <p className="text-[2.4rem] font-black text-white tabular-nums leading-tight">{fmt(props.total)}</p>
          </div>
          <div className="flex-1 px-6 py-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Subtotal</span>
              <span className="font-semibold text-slate-700 tabular-nums">{fmt(props.subtotal)}</span>
            </div>
            {props.serviceCharge > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Service Charge</span>
                <span className="font-semibold text-slate-700 tabular-nums">{fmt(props.serviceCharge)}</span>
              </div>
            )}
            {props.tax > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Pajak</span>
                <span className="font-semibold text-slate-700 tabular-nums">{fmt(props.tax)}</span>
              </div>
            )}
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
      {/* Header */}
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
          {/* Method */}
          <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-4xl">
            {METHOD_EMOJI[props.method] ?? '💰'}
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">{METHOD_LABEL[props.method] ?? props.method}</p>
            <p className="font-black text-slate-900 tabular-nums" style={{ fontSize: 'clamp(2.5rem,7vw,4.5rem)' }}>{fmt(props.total)}</p>
          </div>

          {/* Breakdown */}
          <div className="w-full bg-slate-50 rounded-2xl px-5 py-4 space-y-2.5">
            <div className="flex justify-between text-sm text-slate-500"><span>Subtotal</span><span className="font-semibold tabular-nums">{fmt(props.subtotal)}</span></div>
            {props.serviceCharge > 0 && <div className="flex justify-between text-sm text-slate-500"><span>Service Charge</span><span className="font-semibold tabular-nums">{fmt(props.serviceCharge)}</span></div>}
            {props.tax > 0 && <div className="flex justify-between text-sm text-slate-500"><span>Pajak</span><span className="font-semibold tabular-nums">{fmt(props.tax)}</span></div>}
          </div>

          {/* Spinner */}
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

// ─── COMPLETED ────────────────────────────────────────────────────────────────
function CompletedScreen(props: {
  tenantName: string; orderNumber: string;
  total: number; amountPaid: number; change: number; customerName?: string;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Green header */}
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
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-100 px-12 py-10 flex flex-col items-center gap-7 w-full max-w-lg"
          style={{ animation: 'fadeUp .4s ease both' }}>

          {/* Check icon */}
          <div className="w-24 h-24 rounded-full bg-emerald-500 flex items-center justify-center shadow-xl shadow-emerald-100"
            style={{ animation: 'popIn .5s cubic-bezier(.175,.885,.32,1.275) .1s both' }}>
            <CheckCircle2 size={50} className="text-white" strokeWidth={2.5} />
          </div>

          {/* Total */}
          <div className="text-center">
            <p className="text-2xl font-black text-emerald-600 mb-2">Pembayaran Berhasil!</p>
            <p className="font-black text-slate-900 tabular-nums" style={{ fontSize: 'clamp(2.8rem,8vw,5rem)' }}>
              {fmt(props.total)}
            </p>
          </div>

          {/* Paid / change */}
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

          {/* Thank you */}
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

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function CustomerDisplayPage() {
  const [msg, setMsg] = useState<CFDMessage>({ type: 'idle', tenantName: 'AuraPOS' });
  useCustomerDisplayReceiver((m) => { if (m.type !== 'ping') setMsg(m); });
  const tenantName = msg.type !== 'ping' && 'tenantName' in msg ? msg.tenantName : 'AuraPOS';

  return (
    <>
      <style>{`
        @keyframes popIn  { from{opacity:0;transform:scale(.4)} to{opacity:1;transform:scale(1)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:none} }
        * { -webkit-font-smoothing:antialiased; }
        body { overflow:hidden; }
      `}</style>
      <div className="w-screen h-screen flex flex-col overflow-hidden bg-slate-50">
        {msg.type === 'idle'      && <IdleScreen    tenantName={tenantName} />}
        {msg.type === 'ordering'  && <OrderingScreen  {...msg} />}
        {msg.type === 'payment'   && <PaymentScreen   {...msg} />}
        {msg.type === 'completed' && <CompletedScreen {...msg} />}
      </div>
    </>
  );
}
