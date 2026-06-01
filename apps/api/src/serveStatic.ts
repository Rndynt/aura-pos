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

  // sw.js must never be cached by the browser so updates propagate immediately
  app.get("/sw.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(path.resolve(distPath, "sw.js"));
  });

  // Static assets with long cache (Vite content-hashes filenames)
  app.use(express.static(distPath, {
    maxAge: '1y',
    immutable: true,
    etag: true,
  }));

  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
