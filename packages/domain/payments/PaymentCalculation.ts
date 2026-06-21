import type { POSPaymentMethod } from "./PaymentMethod";
import type { POSPaymentLine } from "./PaymentLine";
import type { POSPaymentStatus } from "./PaymentStatus";

export function roundCurrency(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function calculatePaidAmount(payments: Array<{ amount: number; status?: string }>): number {
  return roundCurrency(payments.filter((payment) => (payment.status ?? "SUCCEEDED").toUpperCase() === "SUCCEEDED").reduce((sum, payment) => sum + payment.amount, 0));
}

export function calculateRemainingAmount(totalAmount: number, paidAmount: number): number {
  return Math.max(0, roundCurrency(totalAmount - paidAmount));
}

export function resolvePaymentStatus(totalAmount: number, paidAmount: number): POSPaymentStatus {
  if (paidAmount <= 0) return "UNPAID";
  return paidAmount + 0.001 >= totalAmount ? "PAID" : "PARTIAL";
}

export function calculateCashChange(amountDue: number, receivedAmount?: number): number {
  if (receivedAmount == null) return 0;
  return Math.max(0, roundCurrency(receivedAmount - amountDue));
}

export function canCompleteFullPayment(input: { totalAmount: number; amount: number; method: POSPaymentMethod; receivedAmount?: number }): boolean {
  if (input.amount <= 0) return false;
  if (input.method === "CASH") return (input.receivedAmount ?? input.amount) + 0.001 >= input.amount && input.amount + 0.001 >= input.totalAmount;
  return Math.abs(input.amount - input.totalAmount) <= 0.001;
}

export function canCompleteMultiPayment(totalAmount: number, lines: POSPaymentLine[]): boolean {
  if (lines.length < 1 || lines.length > 2) return false;
  if (lines.some((line) => line.amount <= 0)) return false;
  const paid = roundCurrency(lines.reduce((sum, line) => sum + line.amount, 0));
  return Math.abs(paid - totalAmount) <= 0.001;
}

export function isSelectedBillPayable(input: { billAmountDue: number; billAmountPaid: number; lineTotal: number }): boolean {
  const remaining = calculateRemainingAmount(input.billAmountDue, input.billAmountPaid);
  return remaining > 0 && Math.abs(roundCurrency(input.lineTotal) - remaining) <= 0.001;
}
