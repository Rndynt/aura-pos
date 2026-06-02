import { useEffect, useRef } from "react";
import { getOrCreateTerminalIdentity } from "@pos/offline";
import { getActiveTenantId } from "@/lib/tenant";
import { buildApiHeaders } from "@/lib/outlet";

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const REGISTER_URL = "/api/terminals/register";

async function registerOrHeartbeat(tenantId: string, terminalId: string, terminalName: string): Promise<string | null> {
  try {
    const res = await fetch(REGISTER_URL, {
      method: "POST",
      headers: buildApiHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify({
        terminal_code: terminalId,
        name: terminalName,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.terminal?.id ?? null;
  } catch {
    return null;
  }
}

async function sendHeartbeat(tenantId: string, serverId: string): Promise<void> {
  try {
    await fetch(`/api/terminals/${serverId}/heartbeat`, {
      method: "PATCH",
      headers: buildApiHeaders(),
      credentials: "include",
    });
  } catch {
    // silent — heartbeat failure is non-critical
  }
}

/**
 * Registers the terminal on mount and sends periodic heartbeats.
 * Transparent to UI — never causes errors or re-renders.
 */
export function useTerminalHeartbeat() {
  const serverIdRef = useRef<string | null>(null);

  useEffect(() => {
    const tenantId = getActiveTenantId();
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function init() {
      try {
        const identity = await getOrCreateTerminalIdentity(tenantId);
        const serverId = await registerOrHeartbeat(tenantId, identity.terminalId, identity.terminalName);
        serverIdRef.current = serverId;

        if (serverId) {
          intervalId = setInterval(() => {
            sendHeartbeat(tenantId, serverId);
          }, HEARTBEAT_INTERVAL_MS);
        }
      } catch {
        // non-critical — POS works without terminal registry
      }
    }

    init();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, []);
}
