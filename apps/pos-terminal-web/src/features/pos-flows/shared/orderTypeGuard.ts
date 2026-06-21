import type { OrderType } from "@/hooks/useCart";

export const ORDER_TYPE_UNAVAILABLE_MESSAGE = "Tipe pesanan belum tersedia. Sistem mencoba mengaktifkan default secara otomatis — coba muat ulang halaman (F5). Jika masih gagal, hubungi administrator.";

export type ActiveOrderTypeOption = {
  id: string;
  code: string;
  isActive?: boolean;
};

export type OrderTypeGuardResult =
  | { ok: true; orderTypeId: string; orderTypeCode: OrderType; wasReplaced: boolean }
  | { ok: false; message: string };

export function resolveValidOrderTypeSelection(
  activeOrderTypes: ActiveOrderTypeOption[],
  selectedOrderTypeId: string | null | undefined,
): OrderTypeGuardResult {
  const selected = selectedOrderTypeId
    ? activeOrderTypes.find((orderType) => orderType.id === selectedOrderTypeId)
    : undefined;
  const fallback = selected ?? activeOrderTypes[0];

  if (!fallback) {
    return { ok: false, message: ORDER_TYPE_UNAVAILABLE_MESSAGE };
  }

  return {
    ok: true,
    orderTypeId: fallback.id,
    orderTypeCode: fallback.code.toLowerCase().replace(/_/g, "-") as OrderType,
    wasReplaced: fallback.id !== selectedOrderTypeId,
  };
}
