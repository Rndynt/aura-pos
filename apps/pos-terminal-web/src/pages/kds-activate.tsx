/**
 * KDS Activation Page — AuraPOS
 * Public page: devices pair to a tenant using a 6-digit activation code
 * generated from the Kitchen Display launcher (/kitchen).
 *
 * Flow:
 *   Step 1 — Enter 6-digit code (generated in /kitchen)
 *   Step 2 — Enter station name (e.g. "Dapur Utama")
 *   Done   — API key stored in localStorage, redirect to /kds
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ChefHat, Delete, ArrowRight, Loader2 } from "lucide-react";

const KDS_DEVICE_KEY  = "kds_device_key";
const KDS_DEVICE_NAME = "kds_device_name";
const KDS_TENANT_ID   = "kds_tenant_id";
const KDS_DEVICE_ID   = "kds_device_id";

export default function KdsActivatePage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<1 | 2>(1);
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  // Already activated? Go straight to KDS.
  useEffect(() => {
    if (localStorage.getItem(KDS_DEVICE_KEY)) {
      setLocation("/kds");
    }
  }, [setLocation]);

  // ── Code entry helpers ──────────────────────────────────────────────────────
  const triggerShake = (msg: string) => {
    setError(msg);
    setShake(true);
    setCode("");
    setTimeout(() => setShake(false), 600);
  };

  const handleDigit = (k: string) => {
    if (code.length >= 6 || loading) return;
    const next = code + k;
    setCode(next);
    setError("");
    if (next.length === 6) {
      // Auto-submit after short delay
      setTimeout(() => validateCode(next), 150);
    }
  };

  const handleDelete = () => {
    if (loading) return;
    setCode((p) => p.slice(0, -1));
    setError("");
  };

  const validateCode = async (c: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/kds/check-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c }),
      });
      const data = await res.json();
      if (!res.ok) {
        triggerShake(data.error ?? "Kode tidak valid atau sudah kadaluarsa");
        return;
      }
      // Valid — move to step 2
      setStep(2);
      setError("");
    } catch {
      triggerShake("Tidak dapat terhubung ke server");
    } finally {
      setLoading(false);
    }
  };

  // ── Device name + activation ────────────────────────────────────────────────
  const handleActivate = async () => {
    if (!deviceName.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/kds/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, deviceName: deviceName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal mengaktifkan perangkat");
        // Code might have expired — go back to step 1
        setStep(1);
        setCode("");
        return;
      }
      const { apiKey, deviceName: name, tenantId, deviceId } = data.data;
      localStorage.setItem(KDS_DEVICE_KEY,  apiKey);
      localStorage.setItem(KDS_DEVICE_NAME, name);
      localStorage.setItem(KDS_TENANT_ID,   tenantId);
      localStorage.setItem(KDS_DEVICE_ID,   deviceId);
      setLocation("/kds");
    } catch {
      setError("Tidak dapat terhubung ke server");
    } finally {
      setLoading(false);
    }
  };

  // ── UI ──────────────────────────────────────────────────────────────────────
  const DIGITS = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-8 select-none px-4">

      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
          <ChefHat size={32} className="text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-black text-white">Kitchen Display</h1>
          <p className="text-slate-400 text-sm mt-1">
            {step === 1
              ? "Masukkan kode aktivasi 6 digit dari halaman Kitchen Display"
              : "Beri nama untuk stasiun dapur ini"}
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
          step === 1 ? "bg-orange-500 text-white" : "bg-slate-700 text-slate-400"
        }`}>
          1 Kode
        </div>
        <div className="w-8 h-px bg-slate-700" />
        <div className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
          step === 2 ? "bg-orange-500 text-white" : "bg-slate-700 text-slate-400"
        }`}>
          2 Nama Stasiun
        </div>
      </div>

      {/* Step 1: 6-digit code numpad */}
      {step === 1 && (
        <>
          {/* Dots */}
          <div
            className={`flex gap-4 transition-transform ${shake ? "animate-[wiggle_0.5s_ease-in-out]" : ""}`}
            style={shake ? { animation: "wiggle 0.5s ease-in-out" } : {}}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
                  i < code.length
                    ? "bg-orange-400 border-orange-400 scale-110"
                    : "bg-transparent border-slate-600"
                }`}
              />
            ))}
          </div>

          {error && <p className="text-sm text-red-400 font-semibold -mt-4">{error}</p>}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3">
            {DIGITS.map((k, i) => {
              if (k === "") return <div key={i} />;
              if (k === "⌫") return (
                <button
                  key={i}
                  onClick={handleDelete}
                  disabled={loading}
                  className="w-20 h-20 rounded-2xl bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all flex items-center justify-center text-slate-300 disabled:opacity-40"
                  data-testid="kds-activate-delete"
                >
                  <Delete size={22} />
                </button>
              );
              return (
                <button
                  key={i}
                  onClick={() => handleDigit(k)}
                  disabled={loading || code.length >= 6}
                  className="w-20 h-20 rounded-2xl bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all text-2xl font-bold text-white disabled:opacity-40"
                  data-testid={`kds-activate-digit-${k}`}
                >
                  {k}
                </button>
              );
            })}
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 size={16} className="animate-spin" />
              Memeriksa kode…
            </div>
          )}
        </>
      )}

      {/* Step 2: Device name input */}
      {step === 2 && (
        <div className="w-full max-w-xs space-y-4">
          <input
            type="text"
            placeholder="Contoh: Dapur Utama, Bar, Grill"
            value={deviceName}
            onChange={(e) => { setDeviceName(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleActivate()}
            autoFocus
            maxLength={50}
            className="w-full bg-slate-800 border border-slate-600 text-white placeholder-slate-500 rounded-2xl px-5 py-4 text-lg font-semibold focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 text-center"
            data-testid="input-kds-device-name"
          />

          {error && <p className="text-sm text-red-400 font-semibold text-center">{error}</p>}

          <button
            onClick={handleActivate}
            disabled={!deviceName.trim() || loading}
            className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white font-extrabold py-4 rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed text-base"
            data-testid="button-kds-activate"
          >
            {loading ? (
              <><Loader2 size={18} className="animate-spin" /> Mengaktifkan…</>
            ) : (
              <><ArrowRight size={18} /> Aktifkan KDS</>
            )}
          </button>

          <button
            onClick={() => { setStep(1); setCode(""); setError(""); }}
            className="w-full text-slate-500 hover:text-slate-300 text-sm font-semibold py-2 transition-colors"
          >
            ← Kembali
          </button>
        </div>
      )}

      <style>{`
        @keyframes wiggle {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-8px); }
          80% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}
