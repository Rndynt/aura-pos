/**
 * types — request/response shapes for payment-orchestration-client-sdk.
 *
 * Self-contained; does NOT import from @northflow/payment-orchestration-core to keep
 * the SDK portable and independently versioned.
 *
 * These types mirror the service API contracts and should stay in sync
 * with packages/payment-orchestration-core/src/application/contracts.ts.
 *
 * Phase 8B: primary config type is now PaymentOrchestrationClientConfig.
 * PaymentEngineClientConfig is a deprecated alias.
 */

// ── Client Configuration ──────────────────────────────────────────────────────

export interface PaymentOrchestrationClientConfig {
  baseUrl: string;
  serviceToken?: string;
  merchantId?: string;
  sourceApp?: string;
}

/** @deprecated Use PaymentOrchestrationClientConfig instead. */
export type PaymentEngineClientConfig = PaymentOrchestrationClientConfig;

// ── Create Payment Intent ─────────────────────────────────────────────────────

/**
 * CreatePaymentIntentRequest — synced with core CreatePaymentIntentInput.
 *
 * Optional external context fields allow multi-source applications to pass
 * their own tenant/outlet/location IDs for traceability without coupling the
 * orchestration engine to AuraPoS internals.
 *
 * Note: merchantId and sourceApp can be omitted if the client was constructed
 * with those values — they will be injected via headers automatically.
 */
export interface CreatePaymentIntentRequest {
  merchantId?: string;
  sourceApp?: string | null;
  externalTenantId?: string | null;
  externalOutletId?: string | null;
  externalLocationId?: string | null;
  externalPayableType: string;
  externalPayableId: string;
  currency: string;
  amountDue: number;
  allowPartial?: boolean;
  expiresAt?: string | null;
  metadata?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
}

export interface PaymentIntentResponse {
  id: string;
  merchantId: string;
  externalPayableType: string;
  externalPayableId: string;
  currency: string;
  amountDue: number;
  amountPaid: number;
  amountRefunded: number;
  amountRemaining: number;
  status: string;
  allowPartial: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Create Gateway Payment ────────────────────────────────────────────────────

export interface CreateGatewayPaymentRequest {
  provider: string;
  method: string;
  amount: number;
  idempotencyKey?: string | null;
  providerAccountId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ProviderActionResponse {
  type: string;
  descriptor: string;
  label: string;
  value: string | null;
  url: string | null;
}

export interface GatewayPaymentResponse {
  transactionId: string;
  status: string;
  providerReference: string | null;
  providerPaymentUrl: string | null;
  providerQrString: string | null;
  providerActions: ProviderActionResponse[];
  immediateSuccess: boolean;
  idempotentReplay: boolean;
}

// ── Payment Intent Status ─────────────────────────────────────────────────────

export interface PaymentIntentStatusResponse {
  intentId: string;
  status: string;
  amountDue: number;
  amountPaid: number;
  amountRemaining: number;
  isTerminal: boolean;
  requiresAction: boolean;
  canRetryPayment: boolean;
}

// ── Refundability ─────────────────────────────────────────────────────────────

export interface RefundabilityResponse {
  canRefund: boolean;
  refundableAmount: number;
  reason: string | null;
}

// ── Phase 8D: Merchant ────────────────────────────────────────────────────────

export interface CreateMerchantRequest {
  id?: string;
  name: string;
  legalName?: string | null;
  sourceApp?: string | null;
  externalRef?: string | null;
  metadata?: Record<string, unknown>;
}

export interface MerchantResponse {
  id: string;
  name: string;
  legalName: string | null;
  status: string;
  metadata: Record<string, unknown>;
}

// ── Phase 8D: Provider Account ────────────────────────────────────────────────

export interface CreateProviderAccountRequest {
  id?: string;
  provider: string;
  environment: 'sandbox' | 'test' | 'production';
  providerAccountRef?: string | null;
  credentialsRef?: string | null;
  publicConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ProviderAccountResponse {
  id: string;
  merchantId: string;
  provider: string;
  environment: string;
  status: string;
  publicConfig: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

// ── Phase 8D: FakeGateway Dev Confirm ─────────────────────────────────────────

export interface ConfirmFakeGatewayPaymentRequest {
  merchantId: string;
}

export interface ConfirmFakeGatewayPaymentResponse {
  alreadyConfirmed: boolean;
  transaction: {
    id: string;
    intentId: string;
    merchantId: string;
    status: string;
    amount: number;
    currency: string;
    providerReference: string | null;
    providerQrString: string | null;
  };
  intent: {
    id: string;
    merchantId: string;
    status: string;
    amountDue: number;
    amountPaid: number;
    amountRemaining: number;
    currency: string;
  };
}
