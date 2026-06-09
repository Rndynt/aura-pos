import type { ReactNode } from "react";
import { OfflineCacheBanner } from "@/components/offline/OfflineCacheBanner";

export function POSLayout({ isOffline, children, overlays }: { isOffline: boolean; children: ReactNode; overlays?: ReactNode }) {
  return (
    <div className="flex flex-col flex-1 min-h-0 h-full w-full max-w-[100vw]">
      <OfflineCacheBanner show={isOffline} />
      <div className="flex flex-1 min-h-0 h-full w-full max-w-[100vw]">
        {children}
        {overlays}
      </div>
    </div>
  );
}
