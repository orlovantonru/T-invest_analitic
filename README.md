# mobInvest — app implementation

A running **Vite + React + TypeScript** implementation of the portfolio-analysis
prototype in the repo root (`Портфель.dc.html`). All 5 tabs plus the full-screen
security detail overlay. Runs on **live T-Invest data** when a token is
configured, otherwise on the bundled **demo dataset**.

## Run (demo data)

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # tsc typecheck + production bundle in dist/
```

## Run with your real portfolio (T-Invest API)

The API token is a credential and must stay server-side, so a small local Node
proxy (`server/`) holds it and the browser only talks to `/api/*`.

1. **Create a read-only token.** T-Bank app or web → Инвестиции → Настройки →
   «Токены Т-Invest API» → new token with **«только чтение»** access.
2. **Configure it:**
   ```bash
   cp .env.example .env
   # edit .env, paste the token into TINVEST_TOKEN=
   ```
   `.env` is gitignored. Nothing writes it anywhere else; the token never reaches
   the browser bundle.
3. **Start both processes:**
   ```bash
   npm run dev      # scripts/dev.mjs runs the proxy (:8787) + Vite (:5173)
   ```
   (`npm run server` runs just the proxy.)

On load the app calls `/auth/me`; with a proxy + valid token it switches to live
data, otherwise it falls back to demo (banner shown). First paint loads only the
Overview essentials — sparklines, operations, sectors, benchmark and per-security
candles are fetched lazily as you open tabs / cards.

### Login (optional locally, required in production)

The proxy gates every `/api/*` route behind a session cookie **when a password is
configured** (`APP_PASSWORD_HASH` / `APP_USERS` + `SESSION_SECRET`). With none set
— the default for local dev — `/api` is open. To try the login flow locally, add
to `.env`:

```bash
SESSION_SECRET=dev-secret-change-me
APP_PASSWORD_HASH=$(node scripts/hash-password.mjs 'your-password' 2>/dev/null)
```

## Deploy to a VPS

See **[DEPLOY.md](DEPLOY.md)** — Docker Compose (`web` + Caddy), public HTTPS on
your domain with a login page, auto TLS via Let's Encrypt.

### What's real vs. approximated in live mode

| Area | Source |
|---|---|
| Accounts, positions, quantities, avg/current price, P&L, day change | `OperationsService/GetPortfolio` + `InstrumentsService/GetInstrumentBy` |
| History, dividends/coupons card, per-security trades | `OperationsService/GetOperationsByCursor` |
| Sparklines, detail chart, per-security period return | `MarketDataService/GetCandles` |
| Sector allocation | `ShareBy` / `BondBy` / `EtfBy` (lazy) |
| Bond coupon schedule | `InstrumentsService/GetBondCoupons` (lazy) |
| **Динамика** portfolio curve | **approximated** — each holding's daily candle return weighted by its current portfolio weight. Benchmark = IMOEX candles. No inflation line (no API source). Custom date range is demo-only. |

The proxy only ever calls a whitelist of read-only methods (`server/tinvest.js`).

## Layout

Полное пофайловое описание, диаграмма потока данных и разбор механизмов —
**[docs/STRUCTURE.md](docs/STRUCTURE.md)**. Краткая версия ниже.

| Path | What |
|---|---|
| `server/index.js` | HTTP server: static SPA + SPA-fallback, `/auth/*`, `/healthz`, gated `/api/*` routes, T-Invest response normalisation. |
| `server/tinvest.js` | Authenticated API client — method whitelist, MoneyValue parsing, in-process caches, concurrency pool, Russian Trusted CA. |
| `server/auth.js` | scrypt password verify + signed-cookie sessions + login rate-limit. Off when no password configured. |
| `scripts/dev.mjs` · `scripts/hash-password.mjs` | Run proxy + Vite together; generate an `APP_PASSWORD_HASH`. |
| `Dockerfile` · `docker-compose.yml` · `Caddyfile` · `.env.production.example` | VPS deploy — see [DEPLOY.md](DEPLOY.md). |
| `src/api/client.ts` | Typed `fetch` wrappers for `/api/*` and `/auth/*`. |
| `src/data/PortfolioDataProvider.tsx` | Context: live/demo status, current-account data, lazy loaders (`ensureCandles`, `ensureOperations`, `ensureSectors`, `ensureBenchmark`, `ensureBondCoupons`), demo fallback. |
| `src/data/demo.ts` | Offline dataset ported 1:1 from the prototype; also the shared type definitions. |
| `src/lib/portfolio.ts` | Pure selectors: `enrich()` → value/cost/P&L, then per-tab (`getTotals`, `getClassSegments`, `getTopMovers`, `getHoldingRows`, `getAllocation`, `getPerformanceDemo` / `getPerformanceLive`, `getHistory`, `getDetail`). |
| `src/lib/format.ts` · `series.ts` | `ru-RU` formatters; chart point builders. |
| `src/store.tsx` | `useReducer` + context for UI state (active tab, filters, sorts, sheet flags, `selectedTicker`). |
| `src/App.tsx` | iPhone frame → loading / `LoginScreen` / demo banner → `Header` + active tab + `BottomNav` + overlays. |
| `src/components/` | `Header`, `BottomNav`, `Sheets` (+ logout), `DetailOverlay`, `LoginScreen`, `Sparkline`, `Chips`, `Icons`, `tabs/`. |
| `src/styles.css` | Classical design tokens vendored from `../_ds/...` + app shell CSS. |

## Notes

- `server.host` / proxy are pinned to `127.0.0.1` (some Windows setups otherwise
  bind IPv6-only and `localhost` fails to resolve). Keep `PROXY_PORT` in `.env` at
  `8787` or update `PROXY_TARGET` in `vite.config.ts`.
- `*.tbank.ru` chains to the *Russian Trusted Root CA* (Минцифры), which Node's
  bundled CA list omits, so `server/russian-trusted-ca.pem` is committed and
  `server/tinvest.js` trusts it in addition to the default roots.
- Sector / exchange codes from the API (`energy`, `moex_mrng_evng_e_wknd_dlr`) are
  mapped to readable labels in `server/index.js`.
- Demo mode keeps the orphaned `vesta-fx` USD account and a fixed `ANCHOR_DATE`
  (2026-08-29) so its synthetic dates stay stable.
- Requires Node ≥ 20.6 (`node --env-file`). No runtime dependencies beyond React
  and Vite.
