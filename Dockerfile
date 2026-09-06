# syntax=docker/dockerfile:1
# Двухстадийная сборка: 1) node:22-slim собирает SPA (tsc + vite → /app/dist),
# 2) рантайм-образ = Node + dist/ + server/. Рантайм-зависимостей нет (React/Vite
# только для сборки), поэтому node_modules в финальный образ не тащим.

# ---- build the SPA ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: Node serves dist/ + /api + /auth ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PROXY_HOST=0.0.0.0 \
    PROXY_PORT=8787
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package.json ./
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PROXY_PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
