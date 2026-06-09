/**
 * useOfflineTables — Sprint 7
 *
 * Offline-first hook for table list.
 * - Online: fetches from server and populates IndexedDB cache.
 * - Offline / error: reads from IndexedDB with `isFromCache: true`.
 *
 * Usage:
 *   const { tables, isFromCache, cacheAge, isLoading, error } = useOfflineTables();
 */

import { useState, useEffect, useCallback } from "react";
import { useTenant } from "@/context/TenantContext";
import { getCachedTables, saveCachedTables, getTablesCachedAt } from "@pos/offline";
import type { Table } from "@pos/domain/seating";
import { buildApiHeaders } from "@/lib/outlet";

export type OfflineTableStatus = "available" | "occupied" | "reserved" | "unknown";

export interface OfflineTable extends Partial<Table> {
  id: string;
  tableNumber: string;
  status: string;
  floor?: string | null;
  capacity?: number | null;
  tableName?: string | null;
}

interface UseOfflineTablesResult {
  tables: OfflineTable[];
  isLoading: boolean;
  isFromCache: boolean;
  cacheAge: number | null;
  error: string | null;
  refetch: () => void;
}

export function useOfflineTables(params?: { status?: string; floor?: string }): UseOfflineTablesResult {
  const { tenantId } = useTenant();
  const [tables, setTables] = useState<OfflineTable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);
  const [cacheAge, setCacheAge] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!tenantId) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams();
        if (params?.status) query.append("status", params.status);
        if (params?.floor) query.append("floor", params.floor);

        const response = await fetch(
          `/api/tables${query.toString() ? `?${query}` : ""}`,
          { headers: buildApiHeaders(), credentials: "include" }
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const json = await response.json();
        const data = json.data ?? json;
        const serverTables: OfflineTable[] = data.tables ?? data ?? [];

        if (!cancelled) {
          await saveCachedTables(tenantId, serverTables);
          setTables(applyFilters(serverTables, params));
          setIsFromCache(false);
          setCacheAge(0);
        }
      } catch {
        const cached = await getCachedTables(tenantId) as OfflineTable[];
        const cachedAt = await getTablesCachedAt(tenantId);
        const age = cachedAt ? Date.now() - new Date(cachedAt).getTime() : null;

        if (!cancelled) {
          setTables(applyFilters(cached, params));
          setIsFromCache(true);
          setCacheAge(age);
          if (!cached.length) {
            setError("Tidak dapat memuat data meja. Periksa koneksi internet.");
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tenantId, params?.status, params?.floor, tick]);

  return { tables, isLoading, isFromCache, cacheAge, error, refetch };
}

function applyFilters(tables: OfflineTable[], params?: { status?: string; floor?: string }): OfflineTable[] {
  return tables.filter((t) => {
    if (params?.status && t.status !== params.status) return false;
    if (params?.floor && t.floor !== params.floor) return false;
    return true;
  });
}

export function useOfflineAvailableTables(): UseOfflineTablesResult {
  return useOfflineTables({ status: "available" });
}
