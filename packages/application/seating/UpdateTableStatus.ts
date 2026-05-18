import { TableRepository } from "@pos/infrastructure/repositories/seating/TableRepository";
import type { Table } from "@shared/schema";

export interface UpdateTableStatusRequest {
  tenantId: string;
  tableId: string;
  status: string;
  currentOrderId?: string;
}

export class UpdateTableStatus {
  constructor(private tableRepository: TableRepository) {}

  async execute(request: UpdateTableStatusRequest): Promise<Table> {
    const { tenantId, tableId, status, currentOrderId } = request;

    const table = await this.tableRepository.updateStatus(
      tenantId,
      tableId,
      status,
      currentOrderId
    );

    return table;
  }
}
