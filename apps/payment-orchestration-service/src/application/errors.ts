/**
 * errors — stable public error-code normalization for standalone operations.
 *
 * Keeps provider/runtime errors from leaking implementation details while preserving
 * stable codes for callers, readiness checks, and worker summaries.
 */

export const PAYMENT_ORCHESTRATION_ERROR_CODES = [
  'PROVIDER_HTTP_CLIENT_UNCONFIGURED',
  'PROVIDER_CREDENTIALS_UNAVAILABLE',
  'PROVIDER_ACCOUNT_REQUIRED',
  'WEBHOOK_SIGNATURE_INVALID',
  'WEBHOOK_BODY_INVALID',
  'OVERPAYMENT_REJECTED',
  'IDEMPOTENCY_CONFLICT',
] as const;

export type PaymentOrchestrationErrorCode =
  typeof PAYMENT_ORCHESTRATION_ERROR_CODES[number]
  | 'PROVIDER_ACCOUNT_PROVIDER_MISMATCH'
  | 'PROVIDER_ACCOUNT_ENVIRONMENT_UNSUPPORTED'
  | 'PROVIDER_ENVIRONMENT_UNSUPPORTED'
  | 'WEBHOOK_SIGNATURE_MISSING'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';

const KNOWN_CODES = new Set<string>([
  ...PAYMENT_ORCHESTRATION_ERROR_CODES,
  'PROVIDER_ACCOUNT_PROVIDER_MISMATCH',
  'PROVIDER_ACCOUNT_ENVIRONMENT_UNSUPPORTED',
  'PROVIDER_ENVIRONMENT_UNSUPPORTED',
  'WEBHOOK_SIGNATURE_MISSING',
  'NOT_FOUND',
  'VALIDATION_ERROR',
]);

export interface NormalizedPaymentOrchestrationError {
  code: PaymentOrchestrationErrorCode;
  message: string;
  statusCode: number;
}

export function normalizePaymentOrchestrationError(error: unknown): NormalizedPaymentOrchestrationError {
  const maybe = error as { code?: unknown; message?: unknown; statusCode?: unknown; status?: unknown } | null;
  const rawCode = typeof maybe?.code === 'string' ? maybe.code : null;
  const code = (rawCode && KNOWN_CODES.has(rawCode) ? rawCode : 'INTERNAL_ERROR') as PaymentOrchestrationErrorCode;
  const statusCode = typeof maybe?.statusCode === 'number'
    ? maybe.statusCode
    : typeof maybe?.status === 'number'
      ? maybe.status
      : code === 'INTERNAL_ERROR'
        ? 500
        : 400;
  const message = typeof maybe?.message === 'string' && maybe.message.trim().length > 0
    ? maybe.message
    : 'Payment orchestration error.';

  return { code, message, statusCode };
}
