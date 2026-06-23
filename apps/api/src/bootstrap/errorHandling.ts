import type { ErrorRequestHandler } from 'express';

export function createErrorHandlingMiddleware(): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    if (process.env.NODE_ENV !== 'production') {
      console.error(`[error-handler] ${status} ${message}`, err.stack);
    }

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  };
}
