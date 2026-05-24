import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("pwa-install-dismissed");
    if (stored === "1") { setDismissed(true); return; }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted" || outcome === "dismissed") {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("pwa-install-dismissed", "1");
  };

  if (!deferredPrompt || dismissed) return null;

  return (
    <div
      role="complementary"
      data-testid="pwa-install-prompt"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700 text-sm max-w-sm w-[calc(100%-2rem)]"
    >
      <Smartphone className="w-5 h-5 shrink-0 text-blue-400" />
      <span className="flex-1 leading-snug">
        Pasang AuraPoS di layar utama untuk akses offline yang lebih cepat.
      </span>
      <Button
        size="sm"
        className="bg-blue-600 hover:bg-blue-700 text-white shrink-0 gap-1"
        onClick={handleInstall}
        data-testid="pwa-install-confirm"
      >
        <Download className="w-3.5 h-3.5" />
        Pasang
      </Button>
      <button
        onClick={handleDismiss}
        className="text-slate-400 hover:text-white shrink-0"
        aria-label="Tutup"
        data-testid="pwa-install-dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
