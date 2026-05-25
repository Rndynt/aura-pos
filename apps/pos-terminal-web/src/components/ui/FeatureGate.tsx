import { Lock } from "lucide-react";
import { useLocation } from "wouter";

interface FeatureGateProps {
  enabled: boolean;
  featureName: string;
  children: React.ReactNode;
}

export function FeatureGate({ enabled, featureName, children }: FeatureGateProps) {
  const [, setLocation] = useLocation();

  if (enabled) return <>{children}</>;

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Lock size={28} className="text-slate-400" />
      </div>
      <h3 className="text-lg font-bold text-slate-800 mb-1">{featureName}</h3>
      <p className="text-sm text-slate-500 mb-6 max-w-xs">
        Fitur ini belum diaktifkan untuk tenant Anda.
      </p>
      <button
        onClick={() => setLocation("/marketplace")}
        className="px-5 py-2.5 bg-slate-800 text-white text-sm font-bold rounded-xl hover:bg-slate-700 transition-colors"
      >
        Aktifkan di Marketplace →
      </button>
    </div>
  );
}
