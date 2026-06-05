/**
 * StandaloneFakeGatewayProvider — dev/test-only simulated payment gateway.
 *
 * Isolated implementation for the standalone payment-orchestration-service.
 * Does NOT import from @pos/domain/payments — fully self-contained.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  DO NOT use in production. No real money movement.                      │
 * │  Dev/test only. Registered only when NODE_ENV !== 'production'.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Scenario dispatch via input.metadata.scenario:
 *
 * | scenario           | status          | notes                             |
 * |--------------------|-----------------|-----------------------------------|
 * | qris               | requires_action | QRIS QR string returned           |
 * | redirect           | requires_action | Web redirect URL                  |
 * | va                 | requires_action | Virtual account number            |
 * | payment_code       | requires_action | Retail payment code               |
 * | immediate_success  | succeeded       | Settled immediately               |
 * | immediate_failure  | failed          | Rejected immediately              |
 * | pending_expiry     | requires_action | With expiry set                   |
 * | default / any      | requires_action | QRIS-like default behavior        |
 */

import { randomBytes } from 'crypto';

export type StandaloneProviderStatus =
  | 'requires_action'
  | 'succeeded'
  | 'failed'
  | 'pending';

export interface StandaloneCreatePaymentInput {
  intentId: string;
  amount: number;
  currency: string;
  method: string;
  metadata?: Record<string, unknown> | null;
}

export interface StandaloneProviderResult {
  status: StandaloneProviderStatus;
  providerReference: string;
  providerPaymentUrl: string | null;
  providerQrString: string | null;
  rawProviderResponse: Record<string, unknown>;
  failureReason: string | null;
  expiresAt: Date | null;
}

export interface StandalonePaymentProvider {
  readonly providerCode: string;
  createPayment(input: StandaloneCreatePaymentInput): Promise<StandaloneProviderResult>;
}

export class StandaloneFakeGatewayProvider implements StandalonePaymentProvider {
  public readonly providerCode = 'fake_gateway';

  async createPayment(input: StandaloneCreatePaymentInput): Promise<StandaloneProviderResult> {
    const scenario =
      (input.metadata?.['scenario'] as string | undefined) ?? 'default';
    const suffix = randomBytes(4).toString('hex');
    const ref = `fake_${input.intentId}_${suffix}`;

    switch (scenario) {
      case 'immediate_success': {
        return {
          status: 'succeeded',
          providerReference: ref,
          providerPaymentUrl: null,
          providerQrString: null,
          rawProviderResponse: { scenario, provider_reference: ref, settled: true },
          failureReason: null,
          expiresAt: null,
        };
      }

      case 'immediate_failure': {
        return {
          status: 'failed',
          providerReference: ref,
          providerPaymentUrl: null,
          providerQrString: null,
          rawProviderResponse: { scenario, provider_reference: ref, failure_code: 'INSUFFICIENT_FUNDS' },
          failureReason: 'INSUFFICIENT_FUNDS',
          expiresAt: null,
        };
      }

      case 'redirect': {
        const url = `https://fake-gateway.local/pay/${ref}`;
        return {
          status: 'requires_action',
          providerReference: ref,
          providerPaymentUrl: url,
          providerQrString: null,
          rawProviderResponse: { scenario, provider_reference: ref, redirect_url: url },
          failureReason: null,
          expiresAt: null,
        };
      }

      case 'va': {
        const vaNumber = `8800${input.amount.toString().slice(-6).padStart(6, '0')}`;
        return {
          status: 'requires_action',
          providerReference: ref,
          providerPaymentUrl: null,
          providerQrString: null,
          rawProviderResponse: { scenario, provider_reference: ref, va_number: vaNumber },
          failureReason: null,
          expiresAt: null,
        };
      }

      case 'payment_code': {
        const code = `FAKE${suffix.toUpperCase()}`;
        return {
          status: 'requires_action',
          providerReference: ref,
          providerPaymentUrl: null,
          providerQrString: null,
          rawProviderResponse: { scenario, provider_reference: ref, payment_code: code },
          failureReason: null,
          expiresAt: null,
        };
      }

      case 'pending_expiry': {
        const url = `https://fake-gateway.local/pay/${ref}`;
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        return {
          status: 'requires_action',
          providerReference: ref,
          providerPaymentUrl: url,
          providerQrString: null,
          rawProviderResponse: { scenario, provider_reference: ref, expires_at: expiresAt.toISOString() },
          failureReason: null,
          expiresAt,
        };
      }

      case 'qris':
      default: {
        const qrString = `FAKE_QR:${ref}:${input.amount}:${input.currency}`;
        return {
          status: 'requires_action',
          providerReference: ref,
          providerPaymentUrl: null,
          providerQrString: qrString,
          rawProviderResponse: { scenario: 'qris', provider_reference: ref, qr_string: qrString },
          failureReason: null,
          expiresAt: null,
        };
      }
    }
  }
}
