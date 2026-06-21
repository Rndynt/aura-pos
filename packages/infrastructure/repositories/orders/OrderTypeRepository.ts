/**
 * Order Type Repository
 * Handles order type CRUD operations and tenant-specific configurations
 */

import { Database } from '../../database';
import { BaseRepository, RepositoryError } from '../BaseRepository';
import {
  orderTypes,
  tenantOrderTypes,
  type OrderType,
  type InsertOrderType,
  type TenantOrderType,
  type InsertTenantOrderType,
} from '@pos/infrastructure/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

export interface IOrderTypeRepository {
  findAll(): Promise<OrderType[]>;
  findByCode(code: string): Promise<OrderType | null>;
  findByTenant(tenantId: string): Promise<OrderType[]>;
  findOrBootstrapForTenant(tenantId: string): Promise<OrderType[]>;
  enableForTenant(tenantId: string, orderTypeId: string, config?: Record<string, any>): Promise<TenantOrderType>;
  disableForTenant(tenantId: string, orderTypeId: string): Promise<void>;
  create(orderType: InsertOrderType): Promise<OrderType>;
}

export class OrderTypeRepository
  extends BaseRepository<OrderType, InsertOrderType>
  implements IOrderTypeRepository
{
  protected table = orderTypes;
  protected entityName = 'OrderType';

  constructor(db: Database) {
    super(db);
  }

  /**
   * Find all active order types
   */
  async findAll(): Promise<OrderType[]> {
    try {
      return await this.db
        .select()
        .from(orderTypes)
        .where(eq(orderTypes.isActive, true));
    } catch (error) {
      this.handleError('find all order types', error);
    }
  }

  /**
   * Find order type by code
   */
  async findByCode(code: string): Promise<OrderType | null> {
    try {
      const result = await this.db
        .select()
        .from(orderTypes)
        .where(eq(orderTypes.code, code))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      this.handleError('find order type by code', error);
    }
  }

  /**
   * Default order type codes bootstrapped for tenants with no configuration.
   * Priority order: TAKE_AWAY first (always safe for any business type).
   */
  private static readonly BOOTSTRAP_CODES = ['TAKE_AWAY', 'DINE_IN', 'DELIVERY'];

  /**
   * Find enabled order types for a tenant — auto-bootstraps defaults if none configured.
   * Safe to call from any endpoint; idempotent (enableForTenant handles upsert).
   */
  async findOrBootstrapForTenant(tenantId: string): Promise<OrderType[]> {
    try {
      const existing = await this.findByTenant(tenantId);
      if (existing.length > 0) return existing;

      // No order types enabled for this tenant — auto-enable the global defaults
      const defaults = await this.db
        .select({ id: orderTypes.id, code: orderTypes.code })
        .from(orderTypes)
        .where(
          and(
            eq(orderTypes.isActive, true),
            inArray(orderTypes.code, OrderTypeRepository.BOOTSTRAP_CODES)
          )
        );

      if (defaults.length === 0) return [];

      // Enable each default order type for this tenant (upsert semantics)
      await Promise.all(
        defaults.map((ot) => this.enableForTenant(tenantId, ot.id))
      );

      return this.findByTenant(tenantId);
    } catch (error) {
      this.handleError('find or bootstrap order types for tenant', error);
    }
  }

  /**
   * Find enabled order types for a tenant
   */
  async findByTenant(tenantId: string): Promise<OrderType[]> {
    try {
      const result = await this.db
        .select({
          id: orderTypes.id,
          code: orderTypes.code,
          name: orderTypes.name,
          description: orderTypes.description,
          isOnPremise: orderTypes.isOnPremise,
          needTableNumber: orderTypes.needTableNumber,
          needAddress: orderTypes.needAddress,
          allowScheduled: orderTypes.allowScheduled,
          isDigitalProduct: orderTypes.isDigitalProduct,
          affectsServiceCharge: orderTypes.affectsServiceCharge,
          isActive: orderTypes.isActive,
          createdAt: orderTypes.createdAt,
          updatedAt: orderTypes.updatedAt,
        })
        .from(orderTypes)
        .innerJoin(
          tenantOrderTypes,
          and(
            eq(tenantOrderTypes.orderTypeId, orderTypes.id),
            eq(tenantOrderTypes.tenantId, tenantId),
            eq(tenantOrderTypes.isEnabled, true)
          )
        )
        .where(eq(orderTypes.isActive, true));

      return result as OrderType[];
    } catch (error) {
      this.handleError('find order types by tenant', error);
    }
  }

  /**
   * Enable an order type for a tenant
   */
  async enableForTenant(
    tenantId: string,
    orderTypeId: string,
    config?: Record<string, any>
  ): Promise<TenantOrderType> {
    try {
      // Check if already exists
      const existing = await this.db
        .select()
        .from(tenantOrderTypes)
        .where(
          and(
            eq(tenantOrderTypes.tenantId, tenantId),
            eq(tenantOrderTypes.orderTypeId, orderTypeId)
          )
        )
        .limit(1);

      if (existing && existing.length > 0) {
        // Update existing record
        const [updated] = await this.db
          .update(tenantOrderTypes)
          .set({
            isEnabled: true,
            config: config || null,
            updatedAt: new Date(),
          })
          .where(eq(tenantOrderTypes.id, existing[0].id))
          .returning();

        return updated;
      } else {
        // Create new record
        const [created] = await this.db
          .insert(tenantOrderTypes)
          .values({
            tenantId,
            orderTypeId,
            isEnabled: true,
            config: config || null,
          })
          .returning();

        return created;
      }
    } catch (error) {
      this.handleError('enable order type for tenant', error);
    }
  }

  /**
   * Disable an order type for a tenant
   */
  async disableForTenant(tenantId: string, orderTypeId: string): Promise<void> {
    try {
      await this.db
        .update(tenantOrderTypes)
        .set({
          isEnabled: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tenantOrderTypes.tenantId, tenantId),
            eq(tenantOrderTypes.orderTypeId, orderTypeId)
          )
        );
    } catch (error) {
      this.handleError('disable order type for tenant', error);
    }
  }

  /**
   * Create a new order type
   */
  async create(orderType: InsertOrderType): Promise<OrderType> {
    try {
      const [created] = await this.db
        .insert(orderTypes)
        .values(orderType)
        .returning();

      return created;
    } catch (error) {
      this.handleError('create order type', error);
    }
  }
}
