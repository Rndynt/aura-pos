import { cacheChannels, publishEvent, subscribeEvent } from "../../services/distributedCache";
import type { CfdConnectionRegistry } from "./CfdConnectionRegistry";

type CfdPubSubMessage = {
  tenantId: string;
  outletId: string;
  deviceId: string;
  message: string;
};

export class CfdPubSubBridge {
  private started = false;

  constructor(private readonly registry: CfdConnectionRegistry) {}

  start(): void {
    if (this.started) return;
    this.started = true;

    void subscribeEvent(cacheChannels.cfd, (payload, meta) => {
      if (meta.isLocalEcho) return;
      const tenantId = typeof payload.tenantId === 'string' ? payload.tenantId : null;
      const message = typeof payload.message === 'string' ? payload.message : null;
      if (!tenantId || !message) return;
      this.registry.broadcastToTenant(tenantId, message);
    });
  }

  publish(message: CfdPubSubMessage): void {
    void publishEvent(cacheChannels.cfd, message);
  }
}
