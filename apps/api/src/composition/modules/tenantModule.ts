import { TenantRepository } from '@pos/infrastructure/repositories/tenants/TenantRepository';
import type { ModuleFactory } from '../types';

export interface TenantModule {
  tenantRepository: TenantRepository;
}

export const createTenantModule: ModuleFactory<TenantModule> = ({ db }) => ({
  tenantRepository: new TenantRepository(db),
});
