import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Keep in sync with PORT in app/.env (proxy default is 8787).
const PROXY_TARGET = "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: PROXY_TARGET, changeOrigin: true },
      "/auth": { target: PROXY_TARGET, changeOrigin: true },
      "/healthz": { target: PROXY_TARGET, changeOrigin: true },
    },
  },
});
