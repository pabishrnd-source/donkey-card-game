import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT ?? "5173";

const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";
const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3001";
// Bind to IPv6 in LAN mode so Windows localhost (::1) and IPv4 clients both work.
const devHost = process.env.DONKEY_LAN_DEV === "1" ? "::" : "127.0.0.1";
const allowedHosts = (process.env.DONKEY_DEV_HOSTS ?? "").split(",").map(host => host.trim()).filter(Boolean);

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: devHost,
    allowedHosts,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
    proxy: {
      "/ws": {
        target: apiTarget,
        ws: true,
      },
      "/api": {
        target: apiTarget,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: devHost,
    allowedHosts,
  },
});
