import { ManageTerminals } from '@pos/application/terminals';
import { DrizzleTerminalRepository } from '@pos/infrastructure/repositories/terminals/DrizzleTerminalRepository';
import type { ModuleFactory } from '../types';

export interface TerminalsModule {
  manageTerminals: ManageTerminals;
}

export const createTerminalsModule: ModuleFactory<TerminalsModule> = ({ db }) => ({
  manageTerminals: new ManageTerminals(new DrizzleTerminalRepository(db)),
});
