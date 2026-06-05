/**
 * providerRegistry — standalone payment provider registry.
 *
 * Phase 8D: registers FakeGateway in non-production environments.
 * Xendit sandbox remains optional and is NOT required for Phase 8D success.
 *
 * Rules:
 * - FakeGateway is always registered in non-production.
 * - In production, no provider is registered (real provider wiring is Phase 8E+).
 * - Never change embedded provider registry in packages/infrastructure/payments/.
 */

import type { StandalonePaymentProvider } from './StandaloneFakeGatewayProvider.ts';
import { StandaloneFakeGatewayProvider } from './StandaloneFakeGatewayProvider.ts';

export type ProviderRegistry = Map<string, StandalonePaymentProvider>;

export function createProviderRegistry(nodeEnv: string): ProviderRegistry {
  const registry = new Map<string, StandalonePaymentProvider>();

  if (nodeEnv !== 'production') {
    const fakeGateway = new StandaloneFakeGatewayProvider();
    registry.set(fakeGateway.providerCode, fakeGateway);
    console.log(
      `[payment-orchestration-service/providers] Registered provider: ${fakeGateway.providerCode} (dev/test only)`,
    );
  }

  return registry;
}
