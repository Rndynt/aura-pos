/**
 * KDS Device Management Routes
 * Handles KDS device pairing (6-digit activation code) and hashed API key auth.
 */

import { createHash, randomInt } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { fromNodeHeaders } from 'better-auth/node';
import { nanoid } from 'nanoid';
import { ResolveKdsDeviceByApiKey, ResolveKdsSessionTenant, TouchKdsDeviceLastSeen, ValidateKdsOrderOutlet } from '@pos/application/kds';
import type { KdsRepositoryPort } from '@pos/application/kds';
import { DrizzleKdsRepository } from '@pos/infrastructure/repositories/kds';

export const KDS_ALLOWED_STATUSES = ['confirmed', 'preparing', 'ready', 'served'] as const;
type KdsAllowedStatus = (typeof KDS_ALLOWED_STATUSES)[number];

type KdsDeviceContext = {
  deviceId: string;
  tenantId: string;
  deviceName: string;
  outletId: string | null;
};

type KdsHandler = (req: Request, res: Response, next: NextFunction) => unknown;

const KDS_ACTIVATION_CODE_LENGTH = 6;
const KDS_ACTIVATION_CODE_MIN = 10 ** (KDS_ACTIVATION_CODE_LENGTH - 1);
const KDS_ACTIVATION_CODE_MAX = 10 ** KDS_ACTIVATION_CODE_LENGTH;
const KDS_MAX_ACTIVATION_ATTEMPTS = 5;
const KDS_ACTIVATION_LOCKOUT_MINUTES = 10;
const KDS_ACTIVATION_CODE_PATTERN = new RegExp(`^\\d{${KDS_ACTIVATION_CODE_LENGTH}}$`);

const kdsPairingLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Terlalu banyak percobaan pairing KDS. Coba lagi dalam 5 menit.',
    code: 'KDS_PAIRING_RATE_LIMIT',
  },
}) as unknown as KdsHandler;

type KdsAuthDependencies = {
  auth: typeof import('../../lib/auth')['auth'];
  authDb: typeof import('../../lib/auth')['authDb'];
};

type KdsRouterDependencies = {
  authDependencies?: KdsAuthDependencies;
  kdsRepository?: KdsRepositoryPort;
  ordersController?: typeof import('../controllers/OrdersController');
  requireKdsKey?: (req: Request, res: Response) => Promise<KdsDeviceContext | null>;
  listOrders?: KdsHandler;
  updateOrderStatus?: KdsHandler;
  validateOrderOutlet?: (input: { orderId: string; tenantId: string; outletId: string }) => Promise<boolean>;
};

export function isKdsAllowedStatus(status: unknown): status is KdsAllowedStatus {
  return typeof status === 'string' && (KDS_ALLOWED_STATUSES as readonly string[]).includes(status);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function requireSession(
  req: Request,
  res: Response,
  authDependencies: KdsAuthDependencies,
  resolveSessionTenant: ResolveKdsSessionTenant,
): Promise<{ userId: string; tenantId: string } | null> {
  try {
    const session = await authDependencies.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session?.user) {
      res.status(401).json({ success: false, error: 'Unauthenticated' });
      return null;
    }
    const tenantId = await resolveSessionTenant.execute(session.user.id);
    if (!tenantId) {
      res.status(403).json({ success: false, error: 'Akun tidak terkait dengan tenant manapun' });
      return null;
    }
    return { userId: session.user.id, tenantId };
  } catch (err) {
    console.error('[kds requireSession]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
    return null;
  }
}

async function requireKdsKey(
  req: Request,
  res: Response,
  resolveDeviceByApiKey: ResolveKdsDeviceByApiKey,
  touchDeviceLastSeen: TouchKdsDeviceLastSeen,
): Promise<KdsDeviceContext | null> {
  const headerValue = req.headers['x-kds-key'];
  const apiKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!apiKey) {
    res.status(401).json({ success: false, error: 'Missing X-KDS-Key header' });
    return null;
  }
  try {
    const device = await resolveDeviceByApiKey.execute(hashKdsApiKey(apiKey));
    if (!device) {
      res.status(401).json({ success: false, error: 'Perangkat KDS tidak valid atau tidak aktif' });
      return null;
    }
    touchDeviceLastSeen.execute(device.id).catch(() => {});
    return {
      deviceId: device.id,
      tenantId: device.tenantId,
      deviceName: device.deviceName ?? 'KDS',
      outletId: device.outletId ?? null,
    };
  } catch (err) {
    console.error('[kds requireKdsKey]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
    return null;
  }
}

function applyKdsDeviceContext(req: Request, device: KdsDeviceContext): void {
  req.tenantId = device.tenantId;
  if (device.outletId) {
    req.outletId = device.outletId;
    req.query.outlet_id = device.outletId;
  }
}

function generateActivationCode(): string {
  return String(randomInt(KDS_ACTIVATION_CODE_MIN, KDS_ACTIVATION_CODE_MAX));
}

function isValidActivationCode(code: unknown): code is string {
  return typeof code === 'string' && KDS_ACTIVATION_CODE_PATTERN.test(code);
}

function hashKdsApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey, 'utf8').digest('hex');
}


export async function createKdsRouter(dependencies: KdsRouterDependencies = {}): Promise<Router> {
  const router = Router();
  const [authDependencies, ordersController] = await Promise.all([
    dependencies.authDependencies ? Promise.resolve(dependencies.authDependencies) : import('../../lib/auth'),
    dependencies.ordersController ? Promise.resolve(dependencies.ordersController) : import('../controllers/OrdersController'),
  ]);
  const kdsRepository = dependencies.kdsRepository ?? new DrizzleKdsRepository(authDependencies.authDb);
  const resolveSessionTenant = new ResolveKdsSessionTenant(kdsRepository);
  const resolveDeviceByApiKey = new ResolveKdsDeviceByApiKey(kdsRepository);
  const touchDeviceLastSeen = new TouchKdsDeviceLastSeen(kdsRepository);
  const validateKdsOrderOutlet = new ValidateKdsOrderOutlet(kdsRepository);
  const requireKdsDevice = dependencies.requireKdsKey
    ?? ((req: Request, res: Response) => requireKdsKey(req, res, resolveDeviceByApiKey, touchDeviceLastSeen));
  const listOrdersHandler = dependencies.listOrders ?? ordersController.listOrders;
  const updateOrderStatusHandler = dependencies.updateOrderStatus ?? ordersController.updateOrderStatus;
  const validateOrderOutletHandler = dependencies.validateOrderOutlet
    ?? ((input: { orderId: string; tenantId: string; outletId: string }) => validateKdsOrderOutlet.execute(input));

// ─── Admin endpoints (require Better Auth session) ────────────────────────────

/** POST /api/kds/generate-code — generate 6-digit activation code */
router.post('/generate-code', async (req, res) => {
  try {
    const session = await requireSession(req, res, authDependencies, resolveSessionTenant);
    if (!session) return;

    const code = generateActivationCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    const deviceId = nanoid();

    await kdsRepository.createActivation({ id: deviceId, tenantId: session.tenantId, activationCode: code, activationExpiresAt: expiresAt });

    res.json({ success: true, data: { code, expiresAt, deviceId } });
  } catch (err) {
    console.error('[kds/generate-code]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/** GET /api/kds/devices — list active/pending devices for tenant */
router.get('/devices', async (req, res) => {
  try {
    const session = await requireSession(req, res, authDependencies, resolveSessionTenant);
    if (!session) return;

    const devices = await kdsRepository.listDevicesByTenant(session.tenantId);

    res.json({ success: true, data: { devices } });
  } catch (err) {
    console.error('[kds/devices GET]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/** DELETE /api/kds/devices/:id — revoke a device */
router.delete('/devices/:id', async (req, res) => {
  try {
    const session = await requireSession(req, res, authDependencies, resolveSessionTenant);
    if (!session) return;

    await kdsRepository.revokeDevice({ deviceId: req.params.id, tenantId: session.tenantId });

    res.json({ success: true });
  } catch (err) {
    console.error('[kds/devices DELETE]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─── Public endpoints (no session required) ───────────────────────────────────

/** POST /api/kds/check-code — validate that a code exists and is not expired */
router.post('/check-code', kdsPairingLimiter, async (req, res) => {
  try {
    const rawCode = String(req.body?.code ?? '');
    if (!isValidActivationCode(rawCode)) {
      return res.status(400).json({ success: false, error: `Kode harus ${KDS_ACTIVATION_CODE_LENGTH} digit angka` });
    }

    const exists = await kdsRepository.pendingActivationExists(rawCode);

    if (!exists) {
      const failure = await kdsRepository.registerActivationFailure(rawCode);
      if (failure?.lockedUntil) {
        return res.status(423).json({
          success: false,
          error: 'Kode terkunci sementara karena terlalu banyak percobaan. Coba lagi nanti.',
          lockedUntil: failure.lockedUntil,
        });
      }
      return res
        .status(404)
        .json({ success: false, error: 'Kode tidak valid atau sudah kadaluarsa' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[kds/check-code]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/** POST /api/kds/verify-code — activate device, returns raw API key once */
router.post('/verify-code', kdsPairingLimiter, async (req, res) => {
  try {
    const rawCode = String(req.body?.code ?? '');
    const { deviceName } = req.body;
    if (!isValidActivationCode(rawCode)) {
      return res.status(400).json({ success: false, error: `Kode harus ${KDS_ACTIVATION_CODE_LENGTH} digit angka` });
    }
    if (!deviceName || typeof deviceName !== 'string' || !deviceName.trim()) {
      return res.status(400).json({ success: false, error: 'Nama stasiun diperlukan' });
    }

    const apiKey = nanoid(32);
    const apiKeyHash = hashKdsApiKey(apiKey);
    const name = deviceName.trim();

    const device = await kdsRepository.activateDevice({ activationCode: rawCode, apiKeyHash, deviceName: name });
    if (!device) {
      const failure = await kdsRepository.registerActivationFailure(rawCode);
      if (failure?.lockedUntil) {
        return res.status(423).json({
          success: false,
          error: 'Kode terkunci sementara karena terlalu banyak percobaan. Coba lagi nanti.',
          lockedUntil: failure.lockedUntil,
        });
      }
      return res
        .status(404)
        .json({ success: false, error: 'Kode tidak valid, sudah dipakai, atau sudah kadaluarsa' });
    }

    res.json({
      success: true,
      data: {
        apiKey,
        deviceId: device.id,
        deviceName: name,
        tenantId: device.tenantId,
      },
    });
  } catch (err) {
    console.error('[kds/verify-code]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─── KDS device endpoints (require X-KDS-Key) ────────────────────────────────

/** GET /api/kds/orders — list active orders for the KDS device's tenant */
router.get('/orders', async (req: Request, res: Response) => {
  const device = await requireKdsDevice(req, res);
  if (!device) return;

  applyKdsDeviceContext(req, device);
  try {
    await (listOrdersHandler as any)(
      req,
      res,
      (err?: unknown) => {
        if (err) {
          console.error('[kds/orders delegate error]', err);
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Internal server error' });
          }
        }
      },
    );
  } catch (err) {
    console.error('[kds/orders]', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
});

/** PATCH /api/kds/orders/:id/status — update order status from KDS */
router.patch('/orders/:id/status', async (req: Request, res: Response) => {
  const device = await requireKdsDevice(req, res);
  if (!device) return;

  if (!isKdsAllowedStatus(req.body?.status)) {
    return res.status(400).json({
      success: false,
      error: `KDS hanya boleh mengubah status ke: ${KDS_ALLOWED_STATUSES.join(', ')}`,
      code: 'VALIDATION_ERROR',
    });
  }

  applyKdsDeviceContext(req, device);
  req.query.mode = 'kitchen';

  if (device.outletId) {
    const matchesOutlet = await validateOrderOutletHandler({
      orderId: req.params.id,
      tenantId: device.tenantId,
      outletId: device.outletId,
    });

    if (!matchesOutlet) {
      return res.status(404).json({
        success: false,
        error: 'Order tidak ditemukan untuk outlet KDS ini',
        code: 'ORDER_NOT_FOUND',
      });
    }
  }

  try {
    await (updateOrderStatusHandler as any)(
      req,
      res,
      (err?: unknown) => {
        if (err) {
          console.error('[kds/orders status delegate error]', err);
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Internal server error' });
          }
        }
      },
    );
  } catch (err) {
    console.error('[kds/orders/:id/status]', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
});

  return router;
}

const defaultKdsRouter = process.env.NODE_ENV === 'test'
  ? await createKdsRouter({
      authDependencies: {
        auth: { api: { getSession: async () => null } },
        authDb: { execute: async () => [] },
      } as any,
      ordersController: {
        listOrders: (_req: Request, res: Response) => res.status(501).json({ success: false }),
        updateOrderStatus: (_req: Request, res: Response) => res.status(501).json({ success: false }),
      } as any,
    })
  : await createKdsRouter();

export default defaultKdsRouter;
