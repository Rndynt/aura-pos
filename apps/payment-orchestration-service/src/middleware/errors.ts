/**
 * errors — global error handler middleware for payment-orchestration-service.
 *
 * Catches unhandled errors from route handlers and returns a consistent
 * JSON error envelope. Never exposes stack traces or raw secrets.
 */

import type { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';
  const message =
    statusCode < 500
      ? err.message
      : 'An internal error occurred. Please try again later.';

  if (statusCode >= 500) {
    console.error('[payment-orchestration-service/error]', err.message, err.stack);
  }

  res.status(statusCode).json({
    ok: false,
    error: code,
    message,
  });
}

export function createApiError(
  message: string,
  statusCode: number,
  code: string,
): ApiError {
  const err = new Error(message) as ApiError;
  err.statusCode = statusCode;
  err.code = code;
  return err;
}
