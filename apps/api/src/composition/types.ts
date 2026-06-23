import type { db as appDb } from '@pos/infrastructure/database';
import type { DrizzleUnitOfWork } from '@pos/infrastructure/unit-of-work';

export type AppDatabase = typeof appDb;

export interface SharedCompositionDeps {
  db: AppDatabase;
  unitOfWork: DrizzleUnitOfWork;
}

export type ModuleFactory<TModule> = (deps: SharedCompositionDeps) => TModule;
