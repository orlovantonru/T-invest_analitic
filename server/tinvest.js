/**
 * Тонкий клиент REST-шлюза T-Invest. О модели приложения ничего не знает —
 * только делает авторизованные POST-запросы, парсит MoneyValue/Quotation
 * (`mv`) и кэширует то, что редко меняется (инструменты, UID индекса, свечи).
 *
 * Все методы вызываются как `POST /rest/{CONTRACT}.{Service}/{Method}` с
 * `Authorization: Bearer <TINVEST_TOKEN>`.
 *
 * `node fetch` не умеет добавлять CA, а `*.tbank.ru` подписан «Russian Trusted
 * Root CA» (Минцифры), которого нет в списке Node → используем `https.request`
 * со своим agent (дефолтные корни + `russian-trusted-ca.pem`).
 *
 * `ALLOWED` — белый список методов (defense in depth): даже read-only токен
 * дальше него не уходит.
 */

import https from "node:https";
import tls from "node:tls";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const BASE = "invest-public-api.tbank.ru";
const BASE_PATH = "/rest";
const CONTRACT = "tinkoff.public.invest.api.contract.v1";

// *.tbank.ru chains to the "Russian Trusted Root CA" (Минцифры), which Node's
// bundled Mozilla CA list omits — trust it in addition to the default roots.
let extraCa = [];
try {
  const caPath = resolve(dirname(fileURLToPath(import.meta.url)), "russian-trusted-ca.pem");
  extraCa = [readFileSync(caPath, "utf8")];
} catch (e) {
  console.warn("[proxy] russian-trusted-ca.pem not loaded:", e.message);
}
const agent = new https.Agent({
  keepAlive: true,
  ca: [...tls.rootCertificates, ...extraCa],
});

/** POST JSON over https with our CA-augmented agent. Returns { status, text }. */
function postJson(path, headers, bodyStr) {
  return new Promise((resolvePromise, reject) => {
    const req = https.request(
      { host: BASE, path, method: "POST", headers, agent },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolvePromise({ status: res.statusCode, text: data }));
      },
    );
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

// Defence in depth: even a read-only token only ever reaches these methods.
export const ALLOWED = new Set([
  "UsersService/GetAccounts",
  "OperationsService/GetPortfolio",
  "OperationsService/GetPositions",
  "OperationsService/GetOperationsByCursor",
  "InstrumentsService/GetInstrumentBy",
  "InstrumentsService/ShareBy",
  "InstrumentsService/BondBy",
  "InstrumentsService/EtfBy",
  "InstrumentsService/GetBondCoupons",
  "InstrumentsService/Indicatives",
  "InstrumentsService/FindInstrument",
  "MarketDataService/GetCandles",
  "MarketDataService/GetLastPrices",
  "MarketDataService/GetClosePrices",
]);

export class ApiError extends Error {
  constructor(status, body) {
    super(`T-Invest API ${status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

const TOKEN = process.env.TINVEST_TOKEN?.trim();

/** MoneyValue / Quotation → число. В API суммы приходят как `{units, nano}`,
 *  где nano — миллиардные доли: 12 ₽ 25 коп = `{units: 12, nano: 250000000}`. */
export const mv = (x) => (x ? Number(x.units || 0) + (x.nano || 0) / 1e9 : 0);

/** Ограничитель параллелизма исходящих запросов — чтобы не упереться в лимиты API. */
function makePool(limit) {
  let active = 0;
  const queue = [];
  const pump = () => {
    if (active >= limit || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--;
        pump();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      pump();
    });
}
const pool = makePool(8);

export async function call(methodPath, body = {}) {
  if (!ALLOWED.has(methodPath)) throw new ApiError(403, `method not allowed: ${methodPath}`);
  if (!TOKEN) throw new ApiError(500, "TINVEST_TOKEN is not set");

  return pool(async () => {
    const bodyStr = JSON.stringify(body);
    const { status, text } = await postJson(
      `${BASE_PATH}/${CONTRACT}.${methodPath}`,
      {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
      },
      bodyStr,
    );
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = text;
    }
    if (status < 200 || status >= 300) throw new ApiError(status, json);
    return json;
  });
}

// ── Кэши в памяти процесса ───────────────────────────────────────────────────
const instrumentCache = new Map(); // uid → инструмент (имя/страна/ISIN/…), бессрочно
const typedCache = new Map(); // `${kind}:${uid}` → share/bond/etf (для сектора и купонов), бессрочно
const candleCache = new Map(); // ключ → { at, data }, TTL ниже
let imoexUidPromise = null; // UID индекса МосБиржи, ищется один раз
const fxUidCache = new Map(); // "USD" → uid валютного инструмента

const CANDLE_TTL_MS = 5 * 60 * 1000;

/** Метаданные инструмента по UID (`GetInstrumentBy`). Кэш бессрочный — не меняются. */
export async function getInstrument(uid) {
  if (instrumentCache.has(uid)) return instrumentCache.get(uid);
  const { instrument } = await call("InstrumentsService/GetInstrumentBy", {
    idType: "INSTRUMENT_ID_TYPE_UID",
    id: uid,
  });
  instrumentCache.set(uid, instrument || null);
  return instrument || null;
}

/** Типизированный инструмент (`ShareBy`/`BondBy`/`EtfBy`) — для сектора и данных облигации. */
export async function getTypedInstrument(kind, uid) {
  const key = `${kind}:${uid}`;
  if (typedCache.has(key)) return typedCache.get(key);
  const method =
    kind === "bond"
      ? "InstrumentsService/BondBy"
      : kind === "etf"
        ? "InstrumentsService/EtfBy"
        : "InstrumentsService/ShareBy";
  try {
    const { instrument } = await call(method, { idType: "INSTRUMENT_ID_TYPE_UID", id: uid });
    typedCache.set(key, instrument || null);
    return instrument || null;
  } catch {
    typedCache.set(key, null);
    return null;
  }
}

/** Свечи (`GetCandles`) → `[{ t, close, open }]`. Кэш с TTL 5 мин по (uid, интервал, окно). */
export async function getCandles(uid, from, to, interval = "CANDLE_INTERVAL_DAY") {
  const key = `${uid}|${interval}|${from}|${to}`;
  const hit = candleCache.get(key);
  if (hit && Date.now() - hit.at < CANDLE_TTL_MS) return hit.data;
  const { candles = [] } = await call("MarketDataService/GetCandles", {
    instrumentId: uid,
    from,
    to,
    interval,
    limit: 2400,
  });
  const data = candles
    .filter((c) => c.close)
    .map((c) => ({ t: c.time, close: mv(c.close), open: mv(c.open) }));
  candleCache.set(key, { at: Date.now(), data });
  return data;
}

/** UID индекса МосБиржи через `Indicatives` (ищем по тикеру IMOEX / имени). Кэш на процесс. */
export async function getImoexUid() {
  if (!imoexUidPromise) {
    imoexUidPromise = call("InstrumentsService/Indicatives", {})
      .then(({ instruments = [] }) => {
        const idx =
          instruments.find((i) => i.ticker === "IMOEX") ||
          instruments.find((i) => /мосбирж|moex/i.test(i.name || ""));
        return idx?.uid || null;
      })
      .catch(() => null);
  }
  return imoexUidPromise;
}

/** Курс валюты к рублю: находим биржевой инструмент (`USD000UTSTOM` и т.п.) и
 *  берём его последнюю цену (`GetLastPrices`). null → конвертация не делается. */
export async function getFxRate(currency) {
  const cur = currency.toUpperCase();
  if (cur === "RUB") return 1;
  const query = cur === "USD" ? "USD000UTSTOM" : cur === "EUR" ? "EUR_RUB__TOM" : null;
  if (!query) return null;
  try {
    let uid = fxUidCache.get(cur);
    if (!uid) {
      const { instruments = [] } = await call("InstrumentsService/FindInstrument", {
        query,
        instrumentKind: "INSTRUMENT_TYPE_CURRENCY",
        apiTradeAvailableFlag: false,
      });
      uid = instruments[0]?.uid || null;
      if (uid) fxUidCache.set(cur, uid);
    }
    if (!uid) return null;
    const { lastPrices = [] } = await call("MarketDataService/GetLastPrices", {
      instrumentId: [uid],
    });
    const p = mv(lastPrices[0]?.price);
    return p || null;
  } catch {
    return null;
  }
}
