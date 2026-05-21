import { useState, useEffect } from "react";

export function PortraitOverlay() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const check = () => {
      const isPortrait = window.matchMedia("(orientation: portrait)").matches;
      const isTouch = window.matchMedia("(pointer: coarse)").matches;
      // Only tablets: touch device AND width >= 768px
      const isTabletWidth = window.innerWidth >= 768;
      setShow(isPortrait && isTouch && isTabletWidth);
    };

    check();
    const mq = window.matchMedia("(orientation: portrait)");
    mq.addEventListener("change", check);
    window.addEventListener("resize", check);
    return () => {
      mq.removeEventListener("change", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  // Reset dismiss when rotated to landscape, so warning re-shows next portrait
  useEffect(() => {
    if (!show) setDismissed(false);
  }, [show]);

  if (!show || dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-slate-900/95 backdrop-blur-sm px-8 text-center"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <style>{`
        @keyframes rotatePhone {
          0%   { transform: rotate(0deg); }
          25%  { transform: rotate(-15deg); }
          50%  { transform: rotate(90deg); }
          75%  { transform: rotate(90deg) scale(1.05); }
          100% { transform: rotate(90deg); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .phone-anim { animation: rotatePhone 2.4s cubic-bezier(0.4,0,0.2,1) infinite; }
        .text-anim  { animation: fadeSlideUp 0.5s ease both; }
      `}</style>

      {/* Icon animasi */}
      <div className="mb-8 phone-anim">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <rect x="16" y="8" width="40" height="56" rx="6" fill="white" opacity="0.15" />
          <rect x="18" y="10" width="36" height="52" rx="5" stroke="white" strokeWidth="2.5" fill="none" />
          <rect x="21" y="15" width="30" height="38" rx="3" fill="white" opacity="0.1" />
          <circle cx="36" cy="58" r="3" fill="white" opacity="0.6" />
          <rect x="29" y="11.5" width="14" height="2" rx="1" fill="white" opacity="0.4" />
          <path d="M 62 24 C 68 32 68 44 62 52" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" fill="none" strokeDasharray="4 3" />
          <path d="M 60 50 L 63 53 L 66 50" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </div>

      {/* Teks */}
      <div className="text-center space-y-2 text-anim mb-8">
        <h2 className="text-2xl font-black text-white tracking-tight">Putar Perangkat</h2>
        <p className="text-slate-400 text-base font-medium leading-relaxed">
          Aplikasi ini dirancang untuk<br />tampilan <span className="text-blue-400 font-bold">landscape</span>
        </p>
      </div>

      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        className="w-full max-w-xs py-3 rounded-2xl bg-white text-slate-900 text-sm font-bold hover:bg-slate-100 active:bg-slate-200 transition-colors"
        data-testid="btn-dismiss-portrait-overlay"
      >
        Tetap gunakan portrait
      </button>
    </div>
  );
}
