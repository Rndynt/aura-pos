import type { EntitlementCode } from './entitlementCatalog';

export const COMING_SOON_ENTITLEMENTS = {
  integrations_api_access: true,
  integrations_webhook: true,
  hardware_barcode_scanner: true,
  integrations_accounting: true,
  hardware_label_printer: true,
} as const satisfies Partial<Record<EntitlementCode, true>>;

export type ComingSoonEntitlementCode = keyof typeof COMING_SOON_ENTITLEMENTS;

export function isComingSoonEntitlementCode(entitlementCode: EntitlementCode | string): boolean {
  return COMING_SOON_ENTITLEMENTS[entitlementCode as ComingSoonEntitlementCode] === true;
}
