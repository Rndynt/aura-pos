/**
 * Deterministic time source for application workflows and tests.
 */
export interface ClockPort {
  now(): Date;
}
