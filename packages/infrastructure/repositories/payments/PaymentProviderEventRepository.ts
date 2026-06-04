import { Database } from '../../database';
import { BaseRepository } from '../BaseRepository';
import {
  paymentProviderEvents,
  type PaymentProviderEvent,
  type InsertPaymentProviderEvent,
} from '../../../../shared/schema';
import { and, eq } from 'drizzle-orm';

export interface IPaymentProviderEventRepository {
  create(data: InsertPaymentProviderEvent): Promise<PaymentProviderEvent>;
  findByProviderEventId(provider: string, providerEventId: string): Promise<PaymentProviderEvent | null>;
}

export class PaymentProviderEventRepository
  extends BaseRepository<PaymentProviderEvent, InsertPaymentProviderEvent>
  implements IPaymentProviderEventRepository
{
  protected table = paymentProviderEvents;
  protected entityName = 'PaymentProviderEvent';

  constructor(db: Database) {
    super(db);
  }

  async create(data: InsertPaymentProviderEvent): Promise<PaymentProviderEvent> {
    try {
      const [result] = await this.db.insert(paymentProviderEvents).values(data).returning();
      return result;
    } catch (error) {
      this.handleError('create', error);
    }
  }

  async findByProviderEventId(provider: string, providerEventId: string): Promise<PaymentProviderEvent | null> {
    try {
      const rows = await this.db
        .select()
        .from(paymentProviderEvents)
        .where(
          and(
            eq(paymentProviderEvents.provider, provider),
            eq(paymentProviderEvents.providerEventId, providerEventId)
          )
        )
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      this.handleError('find by provider event id', error);
    }
  }
}
