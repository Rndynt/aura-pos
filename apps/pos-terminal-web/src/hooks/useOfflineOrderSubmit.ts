import { useRef, useState, useCallback } from "react";
import { getActiveTenantId } from "@/lib/tenant";
import { buildApiHeaders } from "@/lib/outlet";
import { queryClient } from "@/lib/queryClient";
import {
  getOrCreateTerminalIdentity,
  createLocalOrder,
  generateIdempotencyKey,
} from "@pos/offline";
import type { CreateAndPayInput, CreateAndPayResponse } from "@/lib/api/hooks";

export type OfflineOrderResult = CreateAndPayResponse & {
  isLocal?: boolean;
};

type ApiError = Error & {
  status?: number;
  code?: string;
  body?: any;
};

/**
 * Network/server errors we should fall back to local on:
 *  - fetch() throws (TypeError: Failed to fetch → offline)
 *  - 5xx server errors (temporary server-side failure)
 * Validation/business errors (4xx, including 409 insufficient stock) must NOT
 * fall back. They need to surface to the cashier as readable messages.
 */
function isNetworkOrServerError(error: unknown, status?: number): boolean {
  if (status !== undefined) return status >= 500;
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("failed to fetch") ||
      msg.includes("network") ||
      msg.includes("networkerror") ||
      msg.includes("load failed") ||
      msg.includes("timeout")
    );
  }
  return false;
}

async function buildReadableApiError(res: Response): Promise<ApiError> {
  const rawText = await res.text().catch(() => "");
  let parsed: any = null;

  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = null;
  }

  const message =
    parsed?.message ||
    parsed?.error ||
    (rawText && !rawText.trim().startsWith("{") ? rawText : null) ||
    `Request gagal (HTTP ${res.status})`;

  const err = new Error(message) as ApiError;
  err.status = res.status;
  if (parsed?.code) err.code = parsed.code;
  if (parsed) err.body = parsed;
  return err;
}

export function useOfflineOrderSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlightRef = useRef(false);

  const submitOrder = useCallback(
    async (input: CreateAndPayInput): Promise<OfflineOrderResult> => {
      if (inFlightRef.current) {
        throw new Error("Pembayaran sedang diproses. Mohon tunggu sebentar.");
      }
      inFlightRef.current = true;
      setIsSubmitting(true);

      try {
        const tenantId = getActiveTenantId();
        const terminal = await getOrCreateTerminalIdentity(tenantId);
        const idempotencyKey = generateIdempotencyKey(terminal.terminalId);

        let serverStatus: number | undefined;
        let serverError: unknown;
        let serverResult: CreateAndPayResponse | null = null;

        try {
          const res = await fetch("/api/orders/create-and-pay", {
            method: "POST",
            headers: buildApiHeaders({
              "Content-Type": "application/json",
              "x-idempotency-key": idempotencyKey,
            }),
            credentials: "include",
            body: JSON.stringify(input),
          });

          serverStatus = res.status;

          if (res.ok) {
            const body = await res.json();
            serverResult = body.data ?? body;
          } else {
            const readableError = await buildReadableApiError(res);

            // 4xx business errors, especially 409 INSUFFICIENT_STOCK from a
            // stale cart after another cashier has sold the item, must be
            // displayed directly. Never fallback to local/offline for them.
            if (!isNetworkOrServerError(readableError, readableError.status)) {
              throw readableError;
            }

            serverError = readableError;
          }
        } catch (err) {
          const status = (err as ApiError | undefined)?.status ?? serverStatus;
          if (err instanceof Error && !isNetworkOrServerError(err, status)) {
            throw err;
          }
          serverError = err;
        }

        if (serverResult) {
          // Don't mirror to IndexedDB when online — it pollutes offline orders page.
          // Only mirror if we want offline order history caching (future feature).
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
          // P5: refresh outlet-scoped catalog stock so badges update post-sale.
          queryClient.invalidateQueries({ queryKey: ["/api/catalog/products"] });
          return { ...serverResult, isLocal: false };
        }

        const serverErrorStatus = (serverError as ApiError | undefined)?.status ?? serverStatus;
        if (!isNetworkOrServerError(serverError, serverErrorStatus)) {
          throw serverError;
        }

        const localResult = await createLocalOrder({
          tenantId,
          terminalId: terminal.terminalId,
          items: input.items,
          order_type_id: input.order_type_id,
          customer_name: input.customer_name,
          table_number: input.table_number,
          notes: input.notes,
          tax_rate: input.tax_rate,
          service_charge_rate: input.service_charge_rate,
          amount: input.amount,
          payment_method: input.payment_method === "CASH" ? "cash" : input.payment_method === "MANUAL_QRIS" ? "ewallet" : input.payment_method === "MANUAL_TRANSFER" ? "card" : "other",
          transaction_ref: input.transaction_ref,
          payment_notes: input.payment_notes,
          fulfillment_mode: input.fulfillment_mode,
        });

        return {
          order: localResult.order as any,
          payment: localResult.payment as any,
          pricing: localResult.pricing,
          isLocal: true,
        };
      } finally {
        inFlightRef.current = false;
        setIsSubmitting(false);
      }
    },
    []
  );

  return { submitOrder, isSubmitting };
}
