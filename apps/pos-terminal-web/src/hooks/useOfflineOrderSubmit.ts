import { useRef, useState, useCallback } from "react";
import { getActiveTenantId } from "@/lib/tenant";
import { queryClient } from "@/lib/queryClient";
import {
  getOrCreateTerminalIdentity,
  createLocalOrder,
  mirrorServerOrderLocally,
  generateIdempotencyKey,
} from "@pos/offline";
import type { CreateAndPayInput, CreateAndPayResponse } from "@/lib/api/hooks";

export type OfflineOrderResult = CreateAndPayResponse & {
  isLocal?: boolean;
};

/**
 * Network/server errors we should fall back to local on:
 *  - fetch() throws (TypeError: Failed to fetch → offline)
 *  - 5xx server errors (temporary server-side failure)
 * Validation errors (400, 422) must NOT fall back — they indicate invalid input
 * that would fail locally too, and the cashier needs to see and fix them.
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

export function useOfflineOrderSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlightRef = useRef(false);

  const submitOrder = useCallback(
    async (input: CreateAndPayInput): Promise<OfflineOrderResult> => {
      if (inFlightRef.current) {
        throw new Error("Payment already in progress — please wait.");
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
            headers: {
              "Content-Type": "application/json",
              "x-tenant-id": tenantId,
              "x-idempotency-key": idempotencyKey,
            },
            credentials: "include",
            body: JSON.stringify(input),
          });

          serverStatus = res.status;

          if (res.ok) {
            const body = await res.json();
            serverResult = body.data ?? body;
          } else if (serverStatus === 400 || serverStatus === 422) {
            const body = await res.json().catch(() => ({}));
            const msg =
              body?.message ||
              body?.error ||
              `Validasi gagal (HTTP ${serverStatus})`;
            throw new Error(msg);
          } else {
            const body = await res.text();
            serverError = new Error(body || `Server error ${serverStatus}`);
          }
        } catch (err) {
          if (err instanceof Error && !isNetworkOrServerError(err, serverStatus)) {
            throw err;
          }
          serverError = err;
        }

        if (serverResult) {
          const order = serverResult.order as any;
          mirrorServerOrderLocally(
            tenantId,
            terminal.terminalId,
            order?.id ?? "",
            order?.order_number ?? "",
            idempotencyKey
          ).catch(() => undefined);

          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
          return { ...serverResult, isLocal: false };
        }

        if (!isNetworkOrServerError(serverError, serverStatus)) {
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
          payment_method: input.payment_method,
          transaction_ref: input.transaction_ref,
          payment_notes: input.payment_notes,
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
