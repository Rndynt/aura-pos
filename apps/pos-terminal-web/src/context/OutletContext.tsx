import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useTenant } from "@/context/TenantContext";
import {
  resolveInitialOutletId,
  setActiveOutletId,
  getActiveOutletId,
} from "@/lib/outlet";

export type Outlet = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OutletContextValue = {
  outlets: Outlet[];
  activeOutlet: Outlet | null;
  activeOutletId: string | null;
  setActiveOutlet: (outlet: Outlet) => void;
  isLoading: boolean;
  refetch: () => void;
};

const OutletContext = createContext<OutletContextValue | undefined>(undefined);

async function fetchOutlets(tenantId: string): Promise<Outlet[]> {
  const res = await fetch("/api/outlets", {
    headers: { "x-tenant-id": tenantId },
    credentials: "include",
  });
  if (!res.ok) return [];
  const body = await res.json();
  return body.outlets ?? [];
}

export function OutletProvider({ children }: { children: React.ReactNode }) {
  const { tenantId } = useTenant();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [activeOutletId, setActiveOutletIdState] = useState<string | null>(
    () => resolveInitialOutletId(),
  );
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    try {
      const data = await fetchOutlets(tenantId);
      setOutlets(data);

      const stored = getActiveOutletId();
      const valid = data.find((o) => o.id === stored);
      if (valid) {
        setActiveOutletIdState(valid.id);
        setActiveOutletId(valid.id);
      } else {
        const def = data.find((o) => o.isDefault) ?? data[0];
        if (def) {
          setActiveOutletIdState(def.id);
          setActiveOutletId(def.id);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const setActiveOutlet = useCallback((outlet: Outlet) => {
    setActiveOutletIdState(outlet.id);
    setActiveOutletId(outlet.id);
  }, []);

  const activeOutlet = outlets.find((o) => o.id === activeOutletId) ?? null;

  return (
    <OutletContext.Provider
      value={{ outlets, activeOutlet, activeOutletId, setActiveOutlet, isLoading, refetch: load }}
    >
      {children}
    </OutletContext.Provider>
  );
}

export function useOutlet(): OutletContextValue {
  const ctx = useContext(OutletContext);
  if (!ctx) throw new Error("useOutlet must be used inside OutletProvider");
  return ctx;
}
