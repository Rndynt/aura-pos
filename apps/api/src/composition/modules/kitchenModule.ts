import type { KitchenTicketRepository } from '@pos/infrastructure/repositories/orders/KitchenTicketRepository';
import type { CreateKitchenTicket } from '@pos/application/orders/CreateKitchenTicket';

export interface KitchenModule {
  kitchenTicketRepository: KitchenTicketRepository;
  createKitchenTicket: CreateKitchenTicket;
}

export function createKitchenModule(module: KitchenModule): KitchenModule {
  return module;
}
