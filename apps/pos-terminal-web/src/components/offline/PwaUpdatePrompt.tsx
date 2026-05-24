import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    __SW_REGISTRATION__?: ServiceWorkerRegistration;
  }
}

export function PwaUpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const checkForWaiting = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setShowPrompt(true);
      }
    };

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      checkForWaiting(reg);

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setShowPrompt(true);
          }
        });
      });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }, []);

  const handleUpdate = () => {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div
      role="alert"
      data-testid="pwa-update-prompt"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700 text-sm max-w-sm w-full"
    >
      <RefreshCw className="w-4 h-4 shrink-0 text-blue-400" />
      <span className="flex-1">Versi baru tersedia. Perbarui aplikasi?</span>
      <Button
        size="sm"
        variant="outline"
        className="text-white border-slate-600 hover:bg-slate-700 shrink-0"
        onClick={handleUpdate}
        data-testid="pwa-update-confirm"
      >
        Perbarui
      </Button>
      <button
        onClick={() => setShowPrompt(false)}
        className="text-slate-400 hover:text-white"
        aria-label="Tutup"
        data-testid="pwa-update-dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
