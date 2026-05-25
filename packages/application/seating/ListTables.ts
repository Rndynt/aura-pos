import { TableRepository } from "@pos/infrastructure/repositories/seating/TableRepository";
import type { Table } from "@shared/schema";

export interface ListTablesRequest {
  tenantId: string;
  status?: string;
  floor?: string;
  outletId?: string;
}

export interface ListTablesResponse {
  tables: Table[];
  total: number;
}

export class ListTables {
  constructor(private tableRepository: TableRepository) {}

  async execute(request: ListTablesRequest): Promise<ListTablesResponse> {
    const { tenantId, status, floor, outletId } = request;

    const tables = await this.tableRepository.findByTenant(tenantId, { status, floor, outletId });

    return {
      tables,
      total: tables.length,
    };
  }
}
