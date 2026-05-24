import { useEffect, useState } from "react";
import { RefreshCw, CheckCircle } from "lucide-react";

/**
 * PwaUpdatePrompt — shows a brief toast when a new service worker has taken
 * control (autoUpdate mode: SW skips waiting automatically, then triggers
 * controllerchange which reloads the page in most cases).
 *
 * With registerType:"autoUpdate" + skipWaiting:true the old "waiting worker"
 * pattern is no longer needed. Instead we simply show an info toast just
 * before the reload fires so the user understands why the screen flashed.
 */
export function PwaUpdatePrompt() {
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      setUpdated(true);
      setTimeout(() => window.location.reload(), 800);
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  if (!updated) return null;

  return (
    <div
      role="status"
      data-testid="pwa-update-prompt"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700 text-sm max-w-sm w-full animate-in fade-in slide-in-from-bottom-4"
    >
      <CheckCircle className="w-4 h-4 shrink-0 text-green-400" />
      <span className="flex-1">Aplikasi diperbarui. Memuat ulang…</span>
      <RefreshCw className="w-4 h-4 shrink-0 text-blue-400 animate-spin" />
    </div>
  );
}
