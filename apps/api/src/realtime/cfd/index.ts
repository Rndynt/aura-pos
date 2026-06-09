import type { Express, Request } from "express";
import type { Server } from "http";
import { auth, authDb } from "../../lib/auth";
import { CfdAuthService, type CfdAuthDependencies, type CfdDeviceContext } from "./CfdAuthService";
import { CfdConnectionRegistry } from "./CfdConnectionRegistry";
import { CfdHttpController } from "./CfdHttpController";
import { CfdMessageValidator, CFD_MAX_PAYLOAD_BYTES, cfdMessageSchema } from "./CfdMessageValidator";
import { CfdPubSubBridge } from "./CfdPubSubBridge";
import { CfdStateStore } from "./CfdStateStore";
import { CfdWebSocketServer } from "./CfdWebSocketServer";

export { CfdAuthService, type CfdAuthDependencies, type CfdDeviceContext } from "./CfdAuthService";
export { CfdConnectionRegistry } from "./CfdConnectionRegistry";
export { CfdHttpController } from "./CfdHttpController";
export { CfdMessageValidator, CFD_MAX_PAYLOAD_BYTES, cfdMessageSchema } from "./CfdMessageValidator";
export { CfdPubSubBridge } from "./CfdPubSubBridge";
export { CfdStateStore, CFD_DEFAULT_OUTLET_KEY, getCfdOutletKey } from "./CfdStateStore";
export { CfdWebSocketServer } from "./CfdWebSocketServer";

export type CfdModuleDependencies = {
  cfdAuthDependencies?: CfdAuthDependencies;
  requireCfdToken?: (req: Request) => Promise<CfdDeviceContext | null>;
  requireCfdWebSocketToken?: (req: Request, url: URL) => Promise<CfdDeviceContext | null>;
};

export type CfdModule = {
  authService: CfdAuthService;
  registry: CfdConnectionRegistry;
  validator: CfdMessageValidator;
  stateStore: CfdStateStore;
  pubSubBridge: CfdPubSubBridge;
  httpController: CfdHttpController;
  webSocketServer: CfdWebSocketServer;
};

export function createCfdModule(dependencies: CfdModuleDependencies = {}): CfdModule {
  const authService = new CfdAuthService(dependencies.cfdAuthDependencies ?? { auth, authDb });
  const registry = new CfdConnectionRegistry();
  const validator = new CfdMessageValidator();
  const stateStore = new CfdStateStore();
  const pubSubBridge = new CfdPubSubBridge(registry);
  const requireHttpCfdDevice = dependencies.requireCfdToken
    ?? ((req: Request) => authService.requireHttpToken(req));
  const requireWsCfdDevice = dependencies.requireCfdWebSocketToken
    ?? ((req: Request, url: URL) => authService.requireWebSocketToken(req, url));
  const httpController = new CfdHttpController(
    authService,
    registry,
    validator,
    stateStore,
    pubSubBridge,
    requireHttpCfdDevice,
  );
  const webSocketServer = new CfdWebSocketServer(registry, stateStore, requireWsCfdDevice);

  return {
    authService,
    registry,
    validator,
    stateStore,
    pubSubBridge,
    httpController,
    webSocketServer,
  };
}

export function registerCfdHttpRoutes(app: Express, cfdModule: CfdModule): void {
  cfdModule.httpController.registerRoutes(app);
}

export function startCfdPubSubBridge(cfdModule: CfdModule): void {
  cfdModule.pubSubBridge.start();
}

export function registerCfdWebSocketServer(httpServer: Server, cfdModule: CfdModule): void {
  cfdModule.webSocketServer.register(httpServer);
}
