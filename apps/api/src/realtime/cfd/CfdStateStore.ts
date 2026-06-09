import type { Request } from "express";
import { cacheKeys, getCacheString, setCacheString } from "../../services/distributedCache";
import { getHeaderValue, type CfdDeviceContext } from "./CfdAuthService";

const CFD_LATEST_STATE_TTL_SECONDS = Number(process.env.CFD_STATE_TTL_SECONDS ?? 60 * 60 * 12);
export const CFD_DEFAULT_OUTLET_KEY = "global";

export function getCfdOutletKey(req: Request, url?: URL): string {
  return getHeaderValue(req, 'x-outlet-id')
    ?? url?.searchParams.get('outletId')?.trim()
    ?? CFD_DEFAULT_OUTLET_KEY;
}

export class CfdStateStore {
  private latestStateKey(device: CfdDeviceContext, outletId: string): string {
    return cacheKeys.cfdLatest(device.tenantId, outletId || CFD_DEFAULT_OUTLET_KEY, device.deviceId);
  }

  async storeLatestState(device: CfdDeviceContext, outletId: string, payload: string): Promise<void> {
    await setCacheString(this.latestStateKey(device, outletId), payload, CFD_LATEST_STATE_TTL_SECONDS);
  }

  async getLatestState(device: CfdDeviceContext, outletId: string): Promise<string | null> {
    return getCacheString(this.latestStateKey(device, outletId));
  }
}
