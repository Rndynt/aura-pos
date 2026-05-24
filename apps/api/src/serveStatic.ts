/**
 * serveStatic — production static file server.
 *
 * Intentionally separated from vite.ts so that the production build
 * never imports `vite-plugin-pwa` (a devDependency used only during
 * development). Importing vite.ts would transitively pull in vite.config.ts
 * which imports vite-plugin-pwa, crashing the production server.
 */
import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
