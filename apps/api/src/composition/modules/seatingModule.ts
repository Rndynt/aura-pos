import { ListTables } from '@pos/application/seating/ListTables';
import { UpdateTableStatus } from '@pos/application/seating/UpdateTableStatus';
import type { InsertTable } from '@pos/infrastructure/db/schema';
import { OrderRepository } from '@pos/infrastructure/repositories/orders/OrderRepository';
import { TableRepository } from '@pos/infrastructure/repositories/seating/TableRepository';
import type { SharedCompositionDeps } from '../types';

export interface SeatingModule {
  listTables: ListTables;
  updateTableStatus: UpdateTableStatus;
  tableCommands: {
    create: TableRepository['create'];
    findById: TableRepository['findById'];
  };
  seatingOrderQueries: {
    findById: OrderRepository['findById'];
  };
}

export const createSeatingModule = ({ db }: SharedCompositionDeps): SeatingModule => {
  const tableRepository = new TableRepository(db);
  const orderRepository = new OrderRepository(db);

  return {
    listTables: new ListTables(tableRepository),
    updateTableStatus: new UpdateTableStatus(tableRepository),
    tableCommands: {
      create: (table: InsertTable) => tableRepository.create(table),
      findById: tableRepository.findById.bind(tableRepository),
    },
    seatingOrderQueries: {
      findById: orderRepository.findById.bind(orderRepository),
    },
  };
};
