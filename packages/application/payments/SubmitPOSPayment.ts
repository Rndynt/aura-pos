/**
 * SubmitPOSPayment Use Case
 *
 * Orchestrates POS payment submission for ALL flows:
 *   FULL, DOWN_PAYMENT, MULTI_PAYMENT, SPLIT_BILL
 *
 * Rules:
 * - Does not know businessProfile.
 * - Does not import React, frontend hooks, or business-flow UI.
 * - Does not import Drizzle directly.
 * - Validates canonical values and rejects non-canonical input.
 * - Delegates all DB work to the repository port.
 * - Returns SubmitPOSPaymentResult so callers can decide UI behaviour.
 */

import { isPOSPaymentFlow, isPOSPaymentMethod } from "@pos/domain/payments";
import type { SubmitPOSPaymentCommand } from "./POSPaymentCommand";
import type { SubmitPOSPaymentResult } from "./POSPaymentResult";
import type { SubmitPOSPaymentRepositoryPort } from "./ports/SubmitPOSPaymentRepositoryPort";
import type { POSPaymentOrderTypePort } from "./ports/POSPaymentOrderTypePort";

export class POSPaymentValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "POSPaymentValidationError";
  }
}

function rejectNonCanonicalValue(value: string | undefined, allowedValues: readonly string[], code: string): void {
  if (!value) return;
  const normalizedValue = value.toUpperCase();
  const canonicalValues = new Set(allowedValues);
  if (!canonicalValues.has(normalizedValue)) {
    throw new POSPaymentValidationError(
      code,
      code === "PAYMENT_METHOD_INVALID" ? "Metode pembayaran tidak valid." : "Tipe pembayaran tidak valid.",
    );
  }
}

export class SubmitPOSPayment {
  constructor(
    private readonly repository: SubmitPOSPaymentRepositoryPort,
    private readonly orderTypePort: POSPaymentOrderTypePort,
  ) {}

  async execute(command: SubmitPOSPaymentCommand): Promise<SubmitPOSPaymentResult> {
    this.validate(command);

    if (command.order?.order_type_id !== undefined) {
      const typeResult = await this.orderTypePort.validateOrderTypeForTenant(
        command.tenantId,
        command.order.order_type_id,
      );
      if (!typeResult.valid) {
        throw new POSPaymentValidationError(typeResult.errorCode, typeResult.message);
      }
      command = {
        ...command,
        order: command.order
          ? { ...command.order, order_type_id: typeResult.orderTypeId }
          : command.order,
      };
    }

    return this.repository.submit(command);
  }

  private validate(command: SubmitPOSPaymentCommand): void {
    if (!command.tenantId) {
      throw new POSPaymentValidationError("INVALID_TENANT", "tenantId wajib diisi.");
    }

    if (!command.clientPaymentSessionId) {
      throw new POSPaymentValidationError(
        "MISSING_SESSION_ID",
        "clientPaymentSessionId wajib diisi.",
      );
    }

    const flow = command.payment.flow;

    rejectNonCanonicalValue(flow, ["FULL", "DOWN_PAYMENT", "MULTI_PAYMENT", "SPLIT_BILL"], "PAYMENT_FLOW_INVALID");

    if (!isPOSPaymentFlow(flow)) {
      throw new POSPaymentValidationError(
        "PAYMENT_FLOW_INVALID",
        "Tipe pembayaran tidak valid.",
      );
    }

    if (command.source === "FRESH_CART" && !command.orderId && !command.order) {
      throw new POSPaymentValidationError(
        "MISSING_ORDER_PAYLOAD",
        "FRESH_CART memerlukan order payload atau orderId yang sudah ada.",
      );
    }

    if (
      (command.source === "SAVED_ORDER" || command.source === "ACTIVE_ORDER") &&
      !command.orderId
    ) {
      throw new POSPaymentValidationError(
        "MISSING_ORDER_ID",
        "SAVED_ORDER dan ACTIVE_ORDER memerlukan orderId.",
      );
    }

    const lines = command.payment.lines;
    if (!lines || lines.length === 0) {
      throw new POSPaymentValidationError(
        "MISSING_PAYMENT_LINES",
        "Minimal satu baris pembayaran diperlukan.",
      );
    }

    const maxLines = flow === "MULTI_PAYMENT" ? 2 : flow === "SPLIT_BILL" ? 4 : 1;
    if (lines.length > maxLines) {
      throw new POSPaymentValidationError(
        "PAYMENT_LINE_LIMIT",
        flow === "MULTI_PAYMENT"
          ? "Multi payment maksimal 2 baris."
          : flow === "SPLIT_BILL"
            ? "Split bill maksimal 4 bill."
            : "Flow ini hanya mendukung satu baris pembayaran.",
      );
    }

    for (const line of lines) {
      rejectNonCanonicalValue(line.method, ["CASH", "MANUAL_TRANSFER", "MANUAL_QRIS"], "PAYMENT_METHOD_INVALID");
      if (!isPOSPaymentMethod(line.method)) {
        throw new POSPaymentValidationError(
          "PAYMENT_METHOD_INVALID",
          "Metode pembayaran tidak valid.",
        );
      }
      if (!line.amount || line.amount <= 0) {
        throw new POSPaymentValidationError(
          "PAYMENT_AMOUNT_INVALID",
          "Jumlah pembayaran harus lebih dari nol.",
        );
      }
    }

    if (flow === "SPLIT_BILL" && !command.payment.targetBillId) {
      const hasClientBillId = lines.some((l) => l.clientBillId);
      if (!hasClientBillId) {
        throw new POSPaymentValidationError(
          "INVALID_SPLIT_BILL",
          "Split bill memerlukan targetBillId atau clientBillId pada baris pembayaran.",
        );
      }
    }
  }
}
