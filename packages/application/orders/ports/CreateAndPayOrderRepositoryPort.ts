import type { CreateAndPayOrderInput, CreateAndPayOrderOutput } from '../CreateAndPayOrder';

export interface CreateAndPayOrderRepositoryPort {
  createAndPay(input: CreateAndPayOrderInput): Promise<CreateAndPayOrderOutput>;
}
