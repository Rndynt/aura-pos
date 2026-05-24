import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "icons/icon.svg"],
      manifest: false,
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "pages-cache",
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /\/api\/catalog\/products/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-catalog-cache",
              networkTimeoutSeconds: 4,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 5, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\/api\/catalog\/categories/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-catalog-categories-cache",
              networkTimeoutSeconds: 4,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 5, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\/api\/orders\/order-types/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-order-types-cache",
              networkTimeoutSeconds: 4,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 5, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\/api\/tenants\/features/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-features-cache",
              networkTimeoutSeconds: 4,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 5, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      "@shared": path.resolve(import.meta.dirname, "..", "..", "shared"),
      "@pos/core": path.resolve(import.meta.dirname, "..", "..", "packages", "core"),
      "@pos/domain": path.resolve(import.meta.dirname, "..", "..", "packages", "domain"),
      "@pos/application": path.resolve(import.meta.dirname, "..", "..", "packages", "application"),
      "@pos/infrastructure": path.resolve(import.meta.dirname, "..", "..", "packages", "infrastructure"),
      "@pos/features": path.resolve(import.meta.dirname, "..", "..", "packages", "features"),
      "@pos/ui": path.resolve(import.meta.dirname, "..", "..", "packages", "ui", "src"),
      "@pos/offline": path.resolve(import.meta.dirname, "..", "..", "packages", "offline", "src"),
    },
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
