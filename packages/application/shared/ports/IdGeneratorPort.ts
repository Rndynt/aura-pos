/**
 * Deterministic identifier source for application workflows and tests.
 */
export interface IdGeneratorPort {
  generateId(prefix?: string): string;
}
