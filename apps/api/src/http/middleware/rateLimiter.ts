/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse and brute-force attacks.
 *
 * Uses express-rate-limit with in-memory store.
 * For multi-instance deployments, swap to a Redis-backed store.
 */

import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter — 100 requests per minute per IP.
 * Applied to all /api routes.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,  // Disable `X-RateLimit-*` headers
  message: {
    error: 'Too Many Requests',
    message: 'Terlalu banyak request. Coba lagi dalam 1 menit.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

/**
 * Auth endpoints limiter — 20 requests per minute per IP.
 * Stricter to prevent credential stuffing / brute force.
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Terlalu banyak percobaan login. Coba lagi dalam 1 menit.',
    code: 'AUTH_RATE_LIMIT',
  },
});

/**
 * Registration limiter — 5 requests per minute per IP.
 * Prevents spam registrations.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Terlalu banyak percobaan registrasi. Coba lagi dalam 1 menit.',
    code: 'REGISTER_RATE_LIMIT',
  },
});

/**
 * KDS activation limiter — 10 requests per minute per IP.
 * Protects 4-digit activation code from brute force.
 */
export const kdsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Terlalu banyak percobaan aktivasi KDS. Coba lagi dalam 1 menit.',
    code: 'KDS_RATE_LIMIT',
  },
});

/**
 * Payment/order limiter — 30 requests per minute per IP.
 * Prevents payment spam while allowing normal POS usage.
 */
export const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Terlalu banyak request order. Coba lagi dalam 1 menit.',
    code: 'ORDER_RATE_LIMIT',
  },
});
