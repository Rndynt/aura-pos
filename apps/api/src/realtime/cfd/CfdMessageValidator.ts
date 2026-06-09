import type { Request } from "express";
import { z } from "zod";
import { getHeaderValue } from "./CfdAuthService";

export const CFD_MAX_PAYLOAD_BYTES = 16 * 1024;

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const optionalBoundedString = (max: number) => z.string().trim().max(max).optional();
const moneyAmount = z.number().finite().nonnegative().max(1_000_000_000);

const cfdItemSchema = z.object({
  id: boundedString(128),
  name: boundedString(160),
  category: optionalBoundedString(120),
  variantName: optionalBoundedString(120),
  optionsSummary: optionalBoundedString(500),
  quantity: z.number().finite().positive().max(10_000),
  unitPrice: moneyAmount,
  itemTotal: moneyAmount,
}).strict();

const cfdBaseSchema = z.object({
  tenantName: boundedString(160),
});

export const cfdMessageSchema = z.discriminatedUnion('type', [
  cfdBaseSchema.extend({
    type: z.literal('idle'),
    logoText: optionalBoundedString(80),
  }).strict(),
  cfdBaseSchema.extend({
    type: z.literal('ordering'),
    orderNumber: boundedString(80),
    items: z.array(cfdItemSchema).max(100),
    subtotal: moneyAmount,
    tax: moneyAmount,
    serviceCharge: moneyAmount,
    total: moneyAmount,
    customerName: optionalBoundedString(160),
    tableNumber: optionalBoundedString(40),
    orderTypeName: optionalBoundedString(80),
  }).strict(),
  cfdBaseSchema.extend({
    type: z.literal('payment'),
    orderNumber: boundedString(80),
    total: moneyAmount,
    method: boundedString(80),
    items: z.array(cfdItemSchema).max(100),
    subtotal: moneyAmount,
    tax: moneyAmount,
    serviceCharge: moneyAmount,
    customerName: optionalBoundedString(160),
    tableNumber: optionalBoundedString(40),
  }).strict(),
  cfdBaseSchema.extend({
    type: z.literal('completed'),
    orderNumber: boundedString(80),
    total: moneyAmount,
    amountPaid: moneyAmount,
    change: moneyAmount,
    items: z.array(cfdItemSchema).max(100),
    subtotal: moneyAmount,
    tax: moneyAmount,
    serviceCharge: moneyAmount,
    customerName: optionalBoundedString(160),
  }).strict(),
  z.object({ type: z.literal('ping') }).strict(),
]);

export type CfdValidationResult =
  | { success: true; payload: string }
  | { success: false; status: 400 | 413; error: string };

function getRawBodySize(req: Request): number | null {
  const rawBody = (req as Request & { rawBody?: unknown }).rawBody;
  if (Buffer.isBuffer(rawBody)) return rawBody.length;
  const contentLength = getHeaderValue(req, 'content-length');
  if (!contentLength) return null;
  const parsedLength = Number(contentLength);
  return Number.isFinite(parsedLength) ? parsedLength : null;
}

export class CfdMessageValidator {
  validateAndSerialize(message: unknown, req: Request): CfdValidationResult {
    const rawSize = getRawBodySize(req);
    if (rawSize !== null && rawSize > CFD_MAX_PAYLOAD_BYTES) {
      return { success: false, status: 413, error: 'CFD payload too large' };
    }

    const parsed = cfdMessageSchema.safeParse(message);
    if (!parsed.success) {
      return { success: false, status: 400, error: 'Invalid CFD message body' };
    }

    const payload = JSON.stringify(parsed.data);
    if (Buffer.byteLength(payload, 'utf8') > CFD_MAX_PAYLOAD_BYTES) {
      return { success: false, status: 413, error: 'CFD payload too large' };
    }

    return { success: true, payload };
  }
}
