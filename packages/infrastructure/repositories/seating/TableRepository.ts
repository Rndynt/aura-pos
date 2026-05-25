import { eq, and } from "drizzle-orm";
import { Database } from "@pos/infrastructure/database";
import { tables } from "@shared/schema";
import type { Table, InsertTable } from "@shared/schema";

export class TableRepository {
  constructor(private db: Database) {}

  async findByTenant(tenantId: string, filters?: { status?: string; floor?: string; outletId?: string }): Promise<Table[]> {
    const where = [eq(tables.tenantId, tenantId)];
    
    if (filters?.status) {
      where.push(eq(tables.status, filters.status));
    }
    
    if (filters?.floor) {
      where.push(eq(tables.floor, filters.floor));
    }

    if (filters?.outletId) {
      where.push(eq(tables.outletId, filters.outletId));
    }

    return this.db
      .select()
      .from(tables)
      .where(and(...where))
      .execute();
  }

  async findById(id: string, tenantId: string): Promise<Table | null> {
    const result = await this.db
      .select()
      .from(tables)
      .where(and(eq(tables.id, id), eq(tables.tenantId, tenantId)))
      .execute();
    
    return result[0] || null;
  }

  async create(data: InsertTable): Promise<Table> {
    const result = await this.db
      .insert(tables)
      .values(data)
      .returning()
      .execute();
    
    return result[0];
  }

  async updateStatus(tenantId: string, id: string, status: string, orderId?: string): Promise<Table> {
    const result = await this.db
      .update(tables)
      .set({
        status,
        currentOrderId: orderId || null,
        updatedAt: new Date(),
      })
      .where(and(eq(tables.id, id), eq(tables.tenantId, tenantId)))
      .returning()
      .execute();

    if (!result[0]) {
      throw new Error("Table not found or access denied");
    }

    return result[0];
  }

  async bulkCreate(tablesList: InsertTable[]): Promise<Table[]> {
    return this.db
      .insert(tables)
      .values(tablesList)
      .returning()
      .execute();
  }
}
