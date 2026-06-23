import { SubmitPOSPayment } from '@pos/application/payments';
import { DrizzleSubmitPOSPaymentRepository } from '@pos/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository';
import { DrizzlePOSPaymentOrderTypeRepository } from '@pos/infrastructure/repositories/payments/DrizzlePOSPaymentOrderTypeRepository';
import type { ModuleFactory } from '../types';

export interface PaymentsModule {
  submitPOSPayment: SubmitPOSPayment;
  posPaymentOrderTypeRepository: DrizzlePOSPaymentOrderTypeRepository;
}

export const createPaymentsModule: ModuleFactory<PaymentsModule> = ({ db, unitOfWork }) => {
  const posPaymentOrderTypeRepository = new DrizzlePOSPaymentOrderTypeRepository(db);
  return {
    posPaymentOrderTypeRepository,
    submitPOSPayment: new SubmitPOSPayment(
      new DrizzleSubmitPOSPaymentRepository(db, unitOfWork),
      posPaymentOrderTypeRepository,
    ),
  };
};
