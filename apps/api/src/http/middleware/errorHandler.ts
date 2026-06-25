/**
 * Error Handling Middleware
 * Catches and formats errors consistently with proper HTTP status codes
 */

import { logger } from '../../bootstrap/logging';
import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Determine status code — ensure it is always a number
  const statusCode = Number(err.statusCode) || 500;
  
  // Prepare error response
  const errorResponse: any = {
    error: err.name || 'Error',
    message: err.message || 'An unexpected error occurred',
  };

  // Add error code if available
  if (err.code) {
    errorResponse.code = err.code;
  }

  // Include stack trace in development only
  if (isDevelopment && err.stack) {
    errorResponse.stack = err.stack;
  }

  // Log error details
  logger.error(`[${statusCode}] ${err.message}`, {
    path: req.path,
    method: req.method,
    tenantId: req.tenantId,
    error: isDevelopment ? err.stack : err.message,
  });

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * Helper to create API errors with status codes
 */
export function createError(
  message: string,
  statusCode: number = 500,
  code?: string
): ApiError {
  const error: ApiError = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
