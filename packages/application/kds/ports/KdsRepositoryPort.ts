export type KdsSessionTenantRow = { tenantId: string | null };

export type KdsDeviceRow = {
  id: string;
  tenantId: string;
  deviceName: string | null;
  outletId: string | null;
  status: string;
};

export type KdsDeviceListRow = {
  id: string;
  deviceName: string | null;
  status: string;
  createdAt: Date | string | null;
  activatedAt: Date | string | null;
  lastSeenAt: Date | string | null;
  activationCode: string | null;
  activationExpiresAt: Date | string | null;
};

export type KdsActivationFailureRow = { lockedUntil: Date | string | null };
export type KdsActivatedDeviceRow = { id: string; tenantId: string };

export interface CreateKdsActivationInput {
  id: string;
  tenantId: string;
  activationCode: string;
  activationExpiresAt: Date;
}

export interface ActivateKdsDeviceInput {
  activationCode: string;
  apiKeyHash: string;
  deviceName: string;
}

export interface KdsRepositoryPort {
  findSessionTenantByUserId(userId: string): Promise<KdsSessionTenantRow | null>;
  findDeviceByApiKeyHash(apiKeyHash: string): Promise<KdsDeviceRow | null>;
  touchDeviceLastSeen(deviceId: string): Promise<void>;
  orderBelongsToOutlet(input: { orderId: string; tenantId: string; outletId: string }): Promise<boolean>;
  createActivation(input: CreateKdsActivationInput): Promise<void>;
  listDevicesByTenant(tenantId: string): Promise<KdsDeviceListRow[]>;
  revokeDevice(input: { deviceId: string; tenantId: string }): Promise<void>;
  pendingActivationExists(code: string): Promise<boolean>;
  registerActivationFailure(code: string): Promise<KdsActivationFailureRow | null>;
  activateDevice(input: ActivateKdsDeviceInput): Promise<KdsActivatedDeviceRow | null>;
}
