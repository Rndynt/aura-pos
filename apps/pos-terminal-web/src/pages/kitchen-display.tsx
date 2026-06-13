/**
 * Kitchen Display — Admin Launcher
 * Manage KDS devices: generate 6-digit activation codes, view connected devices.
 */

import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ChefHat, QrCode, ExternalLink, Copy, Check,
  Maximize2, RefreshCcw, Trash2, Monitor, Plus,
  Clock, Wifi, WifiOff, KeyRound, Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/design";
import { useToast } from "@/hooks/use-toast";

function getKdsUrl(): string {
  return `${window.location.origin}/kds`;
}

function QRCodeImage({ url }: { url: string }) {
  const encoded = encodeURIComponent(url);
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}&qzone=1&color=1e293b&bgcolor=ffffff&format=png`;
  return (
    <img
      src={src}
      alt="QR Code KDS"
      className="w-40 h-40 rounded-xl border border-slate-200"
      data-testid="img-kds-qr"
    />
  );
}

type Device = {
  id: string;
  device_name: string;
  status: "pending" | "active" | "revoked";
  created_at: string;
  activated_at: string | null;
  last_seen_at: string | null;
  activation_code: string | null;
  activation_expires_at: string | null;
};

function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kds/devices", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setDevices(data.data?.devices ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { devices, loading, refresh: fetch_ };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)  return `${diff}d lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}j lalu`;
  return `${Math.floor(diff / 86400)}h lalu`;
}

function CodeCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  );
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const expired = remaining === 0;
  return (
    <span className={`text-xs font-semibold tabular-nums ${expired ? "text-red-500" : "text-slate-500"}`}>
      {expired ? "Kadaluarsa" : `${mins}:${String(secs).padStart(2, "0")}`}
    </span>
  );
}

export default function KitchenDisplayPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { devices, loading: devicesLoading, refresh: refreshDevices } = useDevices();

  const [copied, setCopied] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [activeCode, setActiveCode] = useState<{ code: string; expiresAt: string; deviceId: string } | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const kdsUrl = getKdsUrl();

  const handleCopyLink = () => {
    navigator.clipboard.writeText(kdsUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleGenerateCode = async () => {
    setGeneratingCode(true);
    try {
      const res = await fetch("/api/kds/generate-code", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Gagal", description: data.error ?? "Tidak dapat generate kode", variant: "destructive" });
        return;
      }
      setActiveCode({ code: data.data.code, expiresAt: data.data.expiresAt, deviceId: data.data.deviceId });
      await refreshDevices();
    } catch {
      toast({ title: "Error", description: "Tidak dapat terhubung ke server", variant: "destructive" });
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleRevoke = async (deviceId: string, deviceName: string) => {
    setRevokingId(deviceId);
    try {
      const res = await fetch(`/api/kds/devices/${deviceId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast({ title: "Perangkat dicabut", description: `${deviceName || "KDS"} tidak lagi terhubung` });
        await refreshDevices();
        // Clear active code if it was for this device
        if (activeCode?.deviceId === deviceId) setActiveCode(null);
      } else {
        toast({ title: "Gagal", description: "Tidak dapat mencabut perangkat", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Tidak dapat terhubung ke server", variant: "destructive" });
    } finally {
      setRevokingId(null);
    }
  };

  const activeDevices  = devices.filter((d) => d.status === "active");
  const pendingDevices = devices.filter(
    (d) => d.status === "pending" && d.activation_expires_at && new Date(d.activation_expires_at) > new Date()
  );

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <PageHeader
        title="Kitchen Display"
        subtitle="Kelola perangkat layar dapur (KDS)"
        onBack={() => setLocation("/hub")}
      />

      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4 max-w-2xl mx-auto w-full">

        {/* Status Banner */}
        <div className={`rounded-2xl border p-4 flex items-center gap-4 ${
          activeDevices.length > 0
            ? "bg-green-50 border-green-200"
            : "bg-slate-100 border-slate-200"
        }`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            activeDevices.length > 0 ? "bg-green-500" : "bg-slate-400"
          }`}>
            <Monitor size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <p className={`text-sm font-extrabold ${
              activeDevices.length > 0 ? "text-green-800" : "text-slate-700"
            }`}>
              {activeDevices.length > 0
                ? `${activeDevices.length} perangkat terhubung`
                : "Belum ada perangkat KDS"}
            </p>
            <p className={`text-xs mt-0.5 ${
              activeDevices.length > 0 ? "text-green-600" : "text-slate-500"
            }`}>
              {activeDevices.length > 0
                ? "KDS aktif dan menerima pesanan"
                : "Gunakan kode aktivasi di bawah untuk menghubungkan perangkat"}
            </p>
          </div>
        </div>

        {/* Generate Activation Code */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound size={16} className="text-slate-500" />
              <h2 className="text-sm font-extrabold text-slate-800">Kode Aktivasi</h2>
            </div>
            <button
              onClick={handleGenerateCode}
              disabled={generatingCode}
              className="flex items-center gap-1.5 text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              data-testid="button-generate-code"
            >
              {generatingCode ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Generate Kode
            </button>
          </div>

          <p className="text-xs text-slate-500">
            Buka <strong className="text-slate-700">{kdsUrl}</strong> di perangkat dapur,
            lalu masukkan kode aktivasi 6 digit ini. Kode berlaku <strong>15 menit</strong>.
          </p>

          {activeCode && (
            <div className="bg-slate-900 rounded-xl p-5 flex flex-col items-center gap-3"
              data-testid="card-active-code">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Kode Aktivasi</p>
              <div className="flex gap-3">
                {activeCode.code.split("").map((digit, i) => (
                  <div
                    key={i}
                    className="w-14 h-16 bg-orange-500 rounded-xl flex items-center justify-center"
                  >
                    <span className="text-3xl font-black text-white tabular-nums">{digit}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <Clock size={13} />
                <CodeCountdown expiresAt={activeCode.expiresAt} />
              </div>
              <p className="text-[10px] text-slate-500 text-center">
                Masukkan kode ini di halaman <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">/kds/activate</code> pada perangkat dapur
              </p>
            </div>
          )}

          {!activeCode && pendingDevices.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
              <strong>{pendingDevices.length}</strong> kode aktif menunggu aktivasi.
              Klik <strong>Generate Kode</strong> untuk membuat kode baru.
            </div>
          )}

          {!activeCode && pendingDevices.length === 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-500 text-center">
              Klik <strong>Generate Kode</strong> untuk membuat kode aktivasi baru
            </div>
          )}
        </div>

        {/* Connected Devices */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wifi size={16} className="text-slate-500" />
              <h2 className="text-sm font-extrabold text-slate-800">Perangkat Terhubung</h2>
              {activeDevices.length > 0 && (
                <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  {activeDevices.length}
                </span>
              )}
            </div>
            <button
              onClick={refreshDevices}
              disabled={devicesLoading}
              className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
              title="Muat ulang daftar perangkat"
              data-testid="button-refresh-devices"
            >
              <RefreshCcw size={14} className={devicesLoading ? "animate-spin" : ""} />
            </button>
          </div>

          {devicesLoading && activeDevices.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-slate-400">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : activeDevices.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
              <WifiOff size={24} strokeWidth={1.5} />
              Belum ada perangkat yang aktif
            </div>
          ) : (
            <div className="space-y-2">
              {activeDevices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5"
                  data-testid={`card-device-${device.id}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
                    <ChefHat size={16} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {device.device_name || "KDS Tidak Bernama"}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Aktif sejak {device.activated_at
                        ? new Date(device.activated_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
                        : "—"}
                      {device.last_seen_at && (
                        <> · Terakhir aktif {timeAgo(device.last_seen_at)}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      Aktif
                    </span>
                    <button
                      onClick={() => handleRevoke(device.id, device.device_name)}
                      disabled={revokingId === device.id}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                      title="Cabut akses perangkat ini"
                      data-testid={`button-revoke-device-${device.id}`}
                    >
                      {revokingId === device.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} />
                      }
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* QR & Link */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <QrCode size={16} className="text-slate-500" />
            <h2 className="text-sm font-extrabold text-slate-800">Buka di Perangkat Dapur</h2>
          </div>
          <p className="text-xs text-slate-500">
            Scan QR code dari tablet/layar dapur untuk membuka halaman KDS.
            Perangkat baru akan diminta memasukkan kode aktivasi.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex-shrink-0">
              <QRCodeImage url={kdsUrl} />
            </div>
            <div className="flex-1 space-y-3 w-full">
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
                <code className="text-xs text-slate-600 flex-1 truncate font-mono">{kdsUrl}</code>
                <button
                  onClick={handleCopyLink}
                  className="flex-shrink-0 text-slate-400 hover:text-blue-600 transition-colors"
                  data-testid="button-copy-kds-link"
                >
                  {copied ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
                </button>
              </div>

              <button
                onClick={() => window.open(kdsUrl, "_blank", "noopener")}
                className="w-full flex items-center justify-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold py-2.5 rounded-xl transition-colors"
                data-testid="button-open-kds-new-tab"
              >
                <ExternalLink size={15} /> Buka di Tab Baru
              </button>

              <button
                onClick={() => {
                  window.open(`${kdsUrl}/activate`, "_blank", "noopener");
                }}
                className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
                data-testid="button-open-kds-activate"
              >
                <Maximize2 size={15} /> Buka Halaman Aktivasi
              </button>
            </div>
          </div>
        </div>

        {/* How to use */}
        <div className="bg-slate-100 rounded-2xl p-4 space-y-2">
          <h3 className="text-xs font-extrabold text-slate-600 uppercase tracking-wide">Cara pakai</h3>
          <ol className="text-xs text-slate-500 space-y-1.5 list-decimal list-inside">
            <li>Klik <strong className="text-slate-700">Generate Kode</strong> untuk membuat kode aktivasi 6 digit (berlaku 15 menit)</li>
            <li>Di tablet dapur, buka <code className="bg-white px-1 rounded text-slate-700">{kdsUrl}</code> atau scan QR code</li>
            <li>Masukkan kode aktivasi → beri nama stasiun (mis. <em>Dapur Utama</em>)</li>
            <li>Perangkat terhubung dan menerima pesanan secara otomatis</li>
            <li>Gunakan tombol <strong className="text-red-600">cabut</strong> untuk mencabut akses perangkat</li>
          </ol>
        </div>

      </div>
    </div>
  );
}
