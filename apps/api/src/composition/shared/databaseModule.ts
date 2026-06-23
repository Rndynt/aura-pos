import { db } from '@pos/infrastructure/database';
import { DrizzleUnitOfWork } from '@pos/infrastructure/unit-of-work';
import type { SharedCompositionDeps } from '../types';

export function createDatabaseModule(): SharedCompositionDeps {
  return {
    db,
    unitOfWork: new DrizzleUnitOfWork(db),
  };
}
