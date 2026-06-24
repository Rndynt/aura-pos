import { SubmitPOSPayment } from '@pos/application/payments';
import { DrizzleSubmitPOSPaymentRepository } from '@pos/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository';
import { DrizzlePOSPaymentOrderTypeRepository } from '@pos/infrastructure/repositories/payments/DrizzlePOSPaymentOrderTypeRepository';
import type { ModuleFactory } from '../types';

export interface PaymentsModule {
  submitPOSPayment: SubmitPOSPayment;
  orderTypePaymentHandlers: {
    validateOrderTypeForTenant: DrizzlePOSPaymentOrderTypeRepository['validateOrderTypeForTenant'];
  };
}

export const createPaymentsModule: ModuleFactory<PaymentsModule> = ({ db, unitOfWork }) => {
  const posPaymentOrderTypeRepository = new DrizzlePOSPaymentOrderTypeRepository(db);
  return {
    submitPOSPayment: new SubmitPOSPayment(
      new DrizzleSubmitPOSPaymentRepository(db, unitOfWork),
      posPaymentOrderTypeRepository,
    ),
    orderTypePaymentHandlers: {
      validateOrderTypeForTenant: posPaymentOrderTypeRepository.validateOrderTypeForTenant.bind(posPaymentOrderTypeRepository),
    },
  };
};
