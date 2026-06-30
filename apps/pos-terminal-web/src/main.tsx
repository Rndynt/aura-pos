import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

try {
  (screen.orientation as any)?.lock?.("landscape").catch?.(() => {});
} catch {}

// ── Lock zoom (PWA / standalone mode) ───────────────────────────────────────
// The viewport meta tag's `user-scalable=no` and CSS `touch-action` cover most
// browsers, but iOS Safari (incl. installed/standalone PWA) still allows
// pinch-zoom via native gesture events and double-tap-to-zoom unless we
// intercept them directly. This is a kiosk-style POS terminal, so zoom is
// disabled everywhere (not just standalone) to keep layout predictable.
(function lockZoom() {
  // iOS Safari pinch-zoom uses non-standard GestureEvent (gesturestart/change/end)
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("gesturechange", (e) => e.preventDefault());
  document.addEventListener("gestureend", (e) => e.preventDefault());

  // Multi-touch pinch on Android/Chromium
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );

  // Double-tap-to-zoom (most mobile browsers zoom on two quick taps)
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );

  // Ctrl/Cmd + wheel zoom (desktop browsers / Chrome OS tablets in kiosk mode)
  document.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false },
  );

  // Ctrl/Cmd +/-/0 keyboard zoom shortcuts
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].includes(e.key)) {
      e.preventDefault();
    }
  });
})();

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (import.meta.env.DEV) {
      // In development, unregister any stale service workers so they don't
      // intercept API requests with cached error responses or short timeouts.
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          reg.unregister();
        }
      });
    } else {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  });
}
