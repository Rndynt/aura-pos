import type { Express, Request } from "express";
import { getHeaderValue, type CfdDeviceContext } from "./CfdAuthService";
import type { CfdAuthService } from "./CfdAuthService";
import type { CfdConnectionRegistry } from "./CfdConnectionRegistry";
import type { CfdMessageValidator } from "./CfdMessageValidator";
import type { CfdPubSubBridge } from "./CfdPubSubBridge";
import { getCfdOutletKey } from "./CfdStateStore";
import type { CfdStateStore } from "./CfdStateStore";

type RequireCfdToken = (req: Request) => Promise<CfdDeviceContext | null>;

export class CfdHttpController {
  constructor(
    private readonly authService: CfdAuthService,
    private readonly registry: CfdConnectionRegistry,
    private readonly validator: CfdMessageValidator,
    private readonly stateStore: CfdStateStore,
    private readonly pubSubBridge: CfdPubSubBridge,
    private readonly requireCfdToken: RequireCfdToken,
  ) {}

  registerRoutes(app: Express): void {
    // ── CFD device/session token endpoint — read/write CFD scope only ─────────
    app.post('/api/cfd/session-token', async (req, res) => {
      try {
        const session = await this.authService.requireAdminSession(req, res);
        if (!session) return;

        const tokenData = await this.authService.createSessionToken(session, req);

        res.json({
          success: true,
          data: tokenData,
        });
      } catch (err) {
        console.error('[cfd/session-token]', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    });

    // ── CFD push endpoint — BEFORE tenant middleware (uses CFD token tenant) ──
    app.post('/api/cfd/update', async (req, res) => {
      try {
        const requestedTenantId = getHeaderValue(req, 'x-tenant-id');
        const device = await this.requireCfdToken(req);

        if (!device) {
          res.status(401).json({ success: false, error: 'Missing or invalid X-CFD-Key' });
          return;
        }

        if (requestedTenantId && requestedTenantId !== device.tenantId) {
          res.status(403).json({ success: false, error: 'CFD token does not belong to requested tenant' });
          return;
        }

        const validation = this.validator.validateAndSerialize(req.body, req);
        if (!validation.success) {
          res.status(validation.status).json({ success: false, error: validation.error });
          return;
        }

        const outletId = getCfdOutletKey(req);
        await this.stateStore.storeLatestState(device, outletId, validation.payload);
        this.registry.broadcastToTenant(device.tenantId, validation.payload);
        this.pubSubBridge.publish({ tenantId: device.tenantId, outletId, deviceId: device.deviceId, message: validation.payload });

        res.json({ success: true, clientCount: this.registry.getClientCount(device.tenantId) });
      } catch (err) {
        console.error('[cfd/update]', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    });
  }
}
