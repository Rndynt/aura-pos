/**
 * SubmitPOSPaymentRepositoryPort
 *
 * Port for the SubmitPOSPayment infrastructure repository.
 * Implementation must run all critical operations in one DB transaction.
 */

import type { SubmitPOSPaymentCommand } from "../POSPaymentCommand";
import type { SubmitPOSPaymentResult } from "../POSPaymentResult";

export interface SubmitPOSPaymentRepositoryPort {
  submit(command: SubmitPOSPaymentCommand): Promise<SubmitPOSPaymentResult>;
}
