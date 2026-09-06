// Конфиг сборки/дев-сервера. В dev проксирует `/api`, `/auth`, `/healthz` на
// локальный Node-прокси (:8787) — фронт всегда обращается к своему origin.
// В проде статику и эти маршруты отдаёт сам Node (`server/index.js`), Vite не участвует.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Должно совпадать с PROXY_PORT в app/.env (по умолчанию 8787).
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
