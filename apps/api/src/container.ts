/**
 * Compatibility export for the API dependency container.
 *
 * New wiring lives under `src/composition/*`; existing controllers and tests can
 * continue importing `container` from this module while callers migrate.
 */
import { createAppContainer } from './composition/createAppContainer';

export type { AppContainer } from './composition/createAppContainer';
export { createAppContainer } from './composition/createAppContainer';

export const container = createAppContainer();
