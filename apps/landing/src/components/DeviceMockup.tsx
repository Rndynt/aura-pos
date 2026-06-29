interface DeviceMockupProps {
  type: "laptop" | "tablet" | "phone";
  src: string;
  className?: string;
  displayWidth?: number;
}

const NATIVE = {
  laptop: { w: 1440, h: 900 },
  tablet: { w: 1024, h: 768 },
  phone: { w: 390, h: 844 },
};

function ScaledIframe({ src, nativeW, nativeH, displayW }: { src: string; nativeW: number; nativeH: number; displayW: number }) {
  const scale = displayW / nativeW;
  const displayH = nativeH * scale;
  return (
    <div style={{ width: displayW, height: displayH, overflow: "hidden", position: "relative", flexShrink: 0 }}>
      <iframe
        src={src}
        title="AuraPoS preview"
        style={{
          width: nativeW,
          height: nativeH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          border: "none",
          display: "block",
          pointerEvents: "none",
        }}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}

export function DeviceMockup({ type, src, className = "", displayWidth }: DeviceMockupProps) {
  const native = NATIVE[type];

  if (type === "laptop") {
    const dw = displayWidth ?? 640;
    const dh = native.h * (dw / native.w);
    return (
      <div className={`flex flex-col items-center ${className}`} style={{ width: dw }}>
        <div className="w-full rounded-t-2xl bg-slate-800 p-[6px] shadow-2xl border border-slate-700" style={{ borderRadius: 16 }}>
          <div className="bg-slate-900 rounded-xl overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-900">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            </div>
            <ScaledIframe src={src} nativeW={native.w} nativeH={native.h} displayW={dw - 12} />
          </div>
        </div>
        <div className="h-3 bg-slate-700 rounded-b-xl" style={{ width: dw - 20 }} />
        <div className="h-2 bg-slate-600 rounded-b-2xl shadow-xl" style={{ width: dw + 20 }} />
      </div>
    );
  }

  if (type === "tablet") {
    const dw = displayWidth ?? 360;
    const dh = native.h * (dw / native.w);
    return (
      <div className={`relative ${className}`}>
        <div
          className="bg-slate-800 border-[6px] border-slate-700 shadow-2xl overflow-hidden flex flex-col"
          style={{ borderRadius: 24, width: dw + 24, padding: 8 }}>
          <div className="flex justify-center py-1">
            <div className="w-12 h-1 rounded-full bg-slate-600" />
          </div>
          <div className="rounded-xl overflow-hidden">
            <ScaledIframe src={src} nativeW={native.w} nativeH={native.h} displayW={dw} />
          </div>
          <div className="flex justify-center py-2">
            <div className="w-8 h-1 rounded-full bg-slate-600" />
          </div>
        </div>
      </div>
    );
  }

  // phone
  const dw = displayWidth ?? 200;
  const dh = native.h * (dw / native.w);
  return (
    <div className={`relative ${className}`}>
      <div
        className="bg-slate-800 border-[5px] border-slate-700 shadow-2xl overflow-hidden flex flex-col"
        style={{ borderRadius: 36, width: dw + 20, padding: 6 }}>
        <div className="flex justify-center py-2">
          <div className="w-14 h-4 bg-slate-900 rounded-full flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
          </div>
        </div>
        <div className="rounded-2xl overflow-hidden">
          <ScaledIframe src={src} nativeW={native.w} nativeH={native.h} displayW={dw} />
        </div>
        <div className="flex justify-center py-2">
          <div className="w-16 h-1 rounded-full bg-slate-600" />
        </div>
      </div>
    </div>
  );
}
