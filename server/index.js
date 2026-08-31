// Proxy for the T-Invest API + static host for the built SPA.
//
//   node --env-file=.env server/index.js         (local dev: `npm run dev` runs this + Vite)
//   node server/index.js                         (container: env comes from Compose)
//
// The API token stays in this process and never reaches the client. On a public
// deployment every /api/* route requires a session cookie (see server/auth.js);
// the static SPA and /healthz stay open.

import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import {
  ApiError,
  call,
  getCandles,
  getFxRate,
  getImoexUid,
  getInstrument,
  getTypedInstrument,
  mv,
} from "./tinvest.js";
import {
  AUTH_ENABLED,
  clearCookie,
  loginAllowed,
  mintCookie,
  noteLoginFail,
  noteLoginOk,
  readSession,
  verifyPassword,
} from "./auth.js";

// PROXY_PORT / PROXY_HOST (not PORT — that collides with the dev-server's env).
const PORT = Number(process.env.PROXY_PORT) || 8787;
const HOST = process.env.PROXY_HOST || "127.0.0.1";
const HAS_TOKEN = !!process.env.TINVEST_TOKEN?.trim();
const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");

const ACCOUNT_TYPE_LABEL = {
  ACCOUNT_TYPE_TINKOFF: "Брокерский",
  ACCOUNT_TYPE_TINKOFF_IIS: "ИИС",
  ACCOUNT_TYPE_INVEST_BOX: "Инвесткопилка",
  ACCOUNT_TYPE_INVEST_FUND: "Фонд",
};

const OP_TYPE_MAP = [
  [/^OPERATION_TYPE_(BUY|BUY_CARD|BUY_MARGIN|DELIVERY_BUY)$/, "buy"],
  [/^OPERATION_TYPE_(SELL|SELL_CARD|SELL_MARGIN|DELIVERY_SELL)$/, "sell"],
  [/^OPERATION_TYPE_(DIVIDEND|DIVIDEND_TRANSFER|DIV_EXT)$/, "dividend"],
  [/^OPERATION_TYPE_COUPON$/, "coupon"],
];
const mapOpType = (t) => OP_TYPE_MAP.find(([re]) => re.test(t))?.[1] ?? null;

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const shortDate = (iso_) => {
  const d = new Date(iso_);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const DAY = 86_400_000;

const SECTOR_LABEL = {
  energy: "Энергетика",
  materials: "Материалы",
  ecomaterials: "Материалы",
  industrials: "Промышленность",
  consumer: "Потреб. сектор",
  health_care: "Здравоохранение",
  financial: "Финансы",
  it: "Технологии",
  telecom: "Телеком",
  utilities: "Коммун. услуги",
  real_estate: "Недвижимость",
  green_buildings: "Недвижимость",
  government: "Гособлигации",
  municipal: "Муниципальные",
  other: "Прочее",
};
const sectorLabel = (s) => (s ? SECTOR_LABEL[s] || s.charAt(0).toUpperCase() + s.slice(1) : "—");

const exchangeLabel = (e) => {
  if (!e) return "—";
  const x = e.toLowerCase();
  if (x.startsWith("moex")) return "MOEX";
  if (x.includes("spb")) return "СПБ Биржа";
  if (x === "fx" || x.startsWith("fx_")) return "Валютный рынок";
  return e.toUpperCase();
};

// ── instrument class mapping ──────────────────────────────────────────────────
function classOf(kind, countryOfRisk) {
  switch (kind) {
    case "share":
      return countryOfRisk === "RU" ? "Акции РФ" : "Акции США";
    case "bond":
      return "Облигации";
    case "etf":
      return "Фонды";
    case "currency":
      return "Денежные средства";
    default:
      return "Прочее";
  }
}

// ── /api/portfolio ───────────────────────────────────────────────────────────
async function buildPortfolio(accountId) {
  const [{ accounts = [] }, portfolio] = await Promise.all([
    call("UsersService/GetAccounts", {}),
    call("OperationsService/GetPortfolio", { accountId, currency: "RUB" }),
  ]);
  const account = accounts.find((a) => a.id === accountId) || accounts[0];

  const positions = portfolio.positions || [];

  const instruments = await Promise.all(
    positions.map((p) => (p.instrumentUid ? getInstrument(p.instrumentUid).catch(() => null) : null)),
  );

  const fxNeeded = new Set();
  positions.forEach((p) => {
    const c = (p.currentPrice?.currency || "rub").toUpperCase();
    if (c !== "RUB") fxNeeded.add(c);
  });
  const fxEntries = await Promise.all([...fxNeeded].map(async (c) => [c, (await getFxRate(c)) || 1]));
  const fx = Object.fromEntries(fxEntries);

  const holdings = positions.map((p, i) => {
    const inst = instruments[i];
    const kind = (p.instrumentType || inst?.instrumentType || "").toLowerCase();
    const isCash = kind === "currency";
    const priceCur = (p.currentPrice?.currency || "rub").toUpperCase();
    const qty = mv(p.quantity);
    const price = isCash ? 1 : mv(p.currentPrice);
    const nkd = mv(p.currentNkd);
    const avgPrice = isCash ? 1 : mv(p.averagePositionPrice);
    const valueInstr = qty * (price + nkd);
    const daily = mv(p.dailyYield);
    const dayChangePct =
      !isCash && valueInstr - daily !== 0 ? (daily / (valueInstr - daily)) * 100 : 0;

    return {
      ticker: isCash ? priceCur : p.ticker || inst?.ticker || p.figi || "—",
      name: isCash ? "Денежные средства" : inst?.name || p.ticker || "—",
      cls: isCash ? "Денежные средства" : classOf(kind, inst?.countryOfRisk),
      sector: isCash ? "—" : sectorLabel(inst?.sector),
      qty,
      avgPrice,
      price: price + nkd,
      dayChangePct: Number(dayChangePct.toFixed(2)),
      spark: [],
      currency: priceCur === "RUB" ? undefined : priceCur,
      fx: priceCur === "RUB" ? undefined : fx[priceCur],
      isCash: isCash || undefined,
      instrumentUid: p.instrumentUid || null,
      figi: p.figi || null,
      isin: inst?.isin || null,
      exchange: exchangeLabel(inst?.exchange),
      kind,
    };
  });

  return {
    account: {
      id: account?.id || accountId,
      broker: "Т-Инвест",
      type: ACCOUNT_TYPE_LABEL[account?.type] || account?.name || "Счёт",
      currency: "RUB",
    },
    holdings,
    apiTotalValue: mv(portfolio.totalAmountPortfolio),
    benchName: "Индекс МосБиржи",
  };
}

// ── /api/operations ──────────────────────────────────────────────────────────
async function buildOperations(accountId, days) {
  const from = iso(days * DAY);
  const to = new Date().toISOString();
  let cursor = "";
  const items = [];
  for (let guard = 0; guard < 20; guard++) {
    const res = await call("OperationsService/GetOperationsByCursor", {
      accountId,
      from,
      to,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    items.push(...(res.items || []));
    if (!res.hasNext || !res.nextCursor) break;
    cursor = res.nextCursor;
  }

  return items
    .map((it) => {
      const type = mapOpType(it.type);
      if (!type) return null;
      const payment = Math.abs(mv(it.payment));
      const cur = (it.payment?.currency || "rub").toUpperCase();
      const qty = Number(it.quantityDone || it.quantity || 0) || undefined;
      const price = mv(it.price) || undefined;
      return {
        date: shortDate(it.date),
        _ts: it.date,
        type,
        ticker: it.ticker || it.figi || "—",
        name: it.name || it.ticker || "—",
        sum: payment,
        qty: type === "buy" || type === "sell" ? qty : undefined,
        price: type === "buy" || type === "sell" ? price : undefined,
        note: it.description || undefined,
        currency: cur === "RUB" ? undefined : cur,
        instrumentUid: it.instrumentUid || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b._ts) - new Date(a._ts));
}

async function buildCandles(uid, days) {
  const data = await getCandles(uid, iso(days * DAY), new Date().toISOString());
  return { uid, closes: data.map((c) => c.close), times: data.map((c) => c.t) };
}

async function buildBenchmark(days) {
  const uid = await getImoexUid();
  if (!uid) return { closes: [], times: [] };
  const data = await getCandles(uid, iso(days * DAY), new Date().toISOString());
  return { uid, closes: data.map((c) => c.close), times: data.map((c) => c.t) };
}

async function buildSectors(pairs) {
  const out = {};
  await Promise.all(
    pairs.map(async ({ uid, kind }) => {
      if (!uid) return;
      const inst = await getTypedInstrument(kind, uid);
      out[uid] = inst?.sector ? sectorLabel(inst.sector) : kind === "bond" ? "Облигации" : "—";
    }),
  );
  return out;
}

async function buildBondCoupons(uid) {
  const from = iso(365 * DAY);
  const to = iso(-3 * 365 * DAY);
  const { events = [] } = await call("InstrumentsService/GetBondCoupons", {
    instrumentId: uid,
    from,
    to,
  });
  const bond = await getTypedInstrument("bond", uid);
  const coupons = events
    .map((e) => ({ date: e.couponDate, payOneBond: mv(e.payOneBond), number: e.couponNumber }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const faceValue = mv(bond?.nominal) || null;
  const perYear = Number(bond?.couponQuantityPerYear) || null;
  const lastCoupon = coupons[coupons.length - 1]?.payOneBond || coupons[0]?.payOneBond || null;
  const couponRatePct =
    faceValue && perYear && lastCoupon ? ((lastCoupon * perYear) / faceValue) * 100 : null;
  return {
    couponRatePct,
    couponPerBond: lastCoupon,
    couponQuantityPerYear: perYear,
    coupons,
    faceValue,
    maturity: bond?.maturityDate || null,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────
const json = (res, status, body) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
};

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function readBody(req, limit = 8192) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

async function serveStatic(req, res, pathname) {
  let rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  if (rel === "/" || rel === "") rel = "/index.html";
  let file = join(DIST, rel);
  if (!file.startsWith(DIST + sep) && file !== DIST) file = join(DIST, "index.html");

  let info;
  try {
    info = await stat(file);
    if (info.isDirectory()) throw new Error("dir");
  } catch {
    file = join(DIST, "index.html"); // SPA fallback
    try {
      info = await stat(file);
    } catch {
      return json(res, 404, { error: "not found" });
    }
  }
  const ext = extname(file);
  const cache = ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable";
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control": cache,
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

// ── router ───────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;
  const q = url.searchParams;

  try {
    // — open —
    if (pathname === "/healthz") return json(res, 200, { ok: true });

    // — auth —
    if (pathname === "/auth/me") {
      const s = readSession(req.headers.cookie);
      return s ? json(res, 200, { user: s.user, authEnabled: AUTH_ENABLED }) : json(res, 401, { error: "unauthorized" });
    }
    if (pathname === "/auth/login" && req.method === "POST") {
      const ip = clientIp(req);
      if (!loginAllowed(ip)) return json(res, 429, { error: "too many attempts, try later" });
      let creds = {};
      try {
        creds = JSON.parse((await readBody(req)) || "{}");
      } catch {
        return json(res, 400, { error: "bad request" });
      }
      const user = String(creds.user || "admin");
      if (verifyPassword(user, String(creds.password || ""))) {
        noteLoginOk(ip);
        res.setHeader("Set-Cookie", mintCookie(user));
        return json(res, 200, { user });
      }
      noteLoginFail(ip);
      return json(res, 401, { error: "invalid credentials" });
    }
    if (pathname === "/auth/logout" && req.method === "POST") {
      res.setHeader("Set-Cookie", clearCookie());
      return json(res, 204, {});
    }

    // — API (gated) —
    if (pathname.startsWith("/api/")) {
      if (!readSession(req.headers.cookie)) return json(res, 401, { error: "unauthorized" });

      if (pathname === "/api/accounts") {
        const { accounts = [] } = await call("UsersService/GetAccounts", {});
        return json(
          res,
          200,
          accounts
            .filter((a) => a.type?.startsWith("ACCOUNT_TYPE_TINKOFF") || a.type === "ACCOUNT_TYPE_INVEST_FUND")
            .map((a) => ({
              id: a.id,
              broker: "Т-Инвест",
              type: ACCOUNT_TYPE_LABEL[a.type] || a.name || "Счёт",
              currency: "RUB",
            })),
        );
      }
      if (pathname === "/api/portfolio") {
        const accountId = q.get("accountId");
        if (!accountId) return json(res, 400, { error: "accountId required" });
        return json(res, 200, await buildPortfolio(accountId));
      }
      if (pathname === "/api/operations") {
        const accountId = q.get("accountId");
        if (!accountId) return json(res, 400, { error: "accountId required" });
        return json(res, 200, await buildOperations(accountId, Number(q.get("days")) || 180));
      }
      if (pathname === "/api/candles") {
        const uid = q.get("uid");
        if (!uid) return json(res, 400, { error: "uid required" });
        return json(res, 200, await buildCandles(uid, Number(q.get("days")) || 180));
      }
      if (pathname === "/api/benchmark-candles") {
        return json(res, 200, await buildBenchmark(Number(q.get("days")) || 180));
      }
      if (pathname === "/api/sectors") {
        const pairs = (q.get("items") || "")
          .split(",")
          .filter(Boolean)
          .map((s) => {
            const [uid, kind] = s.split(":");
            return { uid, kind: kind || "share" };
          });
        return json(res, 200, await buildSectors(pairs));
      }
      if (pathname === "/api/bond-coupons") {
        const uid = q.get("uid");
        if (!uid) return json(res, 400, { error: "uid required" });
        return json(res, 200, await buildBondCoupons(uid));
      }
      return json(res, 404, { error: "not found" });
    }

    // — static SPA —
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res, pathname);
    return json(res, 404, { error: "not found" });
  } catch (err) {
    const status = err instanceof ApiError ? err.status || 502 : 500;
    console.error(`[proxy] ${pathname} -> ${status}:`, err.message);
    return json(res, status, { error: err.message, status });
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    `[proxy] http://${HOST}:${PORT}  token:${HAS_TOKEN ? "set" : "MISSING"}  auth:${AUTH_ENABLED ? "on" : "OFF"}`,
  );
  if (!HAS_TOKEN) console.log("[proxy] set TINVEST_TOKEN (app/.env for local, Compose env for prod)");
});
