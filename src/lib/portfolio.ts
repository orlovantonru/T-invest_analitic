/**
 * ── Селекторы: сырые данные → всё, что рисует UI ─────────────────────────────
 *
 * Единственное место, где считается производное: стоимость и P&L позиции, доли,
 * аллокация, топ движения, доходность за период, детали карточки бумаги.
 *
 * Функции ЧИСТЫЕ и не знают про источник данных — на вход им дают массивы
 * (`holdings`, `operations`, свечи), которые собирает `PortfolioDataProvider`
 * (из API в live-режиме или из `data/demo.ts` в демо). Каждый селектор
 * возвращает уже готовые к рендеру строки/цвета, чтобы компоненты остались
 * «тупыми».
 *
 * Демо-специфика (`ACCOUNTS`, `HOLDINGS`, `PERF_SEED`) импортируется только
 * функциями с суффиксом `...Demo`.
 */
import {
  ACCOUNTS,
  BOND_INFO,
  HOLDINGS,
  INFLATION_SEED,
  ISSUER_INFO,
  NEG,
  PALETTE,
  PERF_SEED,
  PERIODS,
  POS,
  TX_TAG_CLASS,
  TX_TYPE_LABEL,
  ANCHOR_DATE,
  type Account,
  type Holding,
  type Tx,
} from "../data/demo";
import type { BondCoupons } from "../api/client";
import {
  arrow,
  daysBetween,
  fmtDateShort,
  fmtMoney,
  fmtPct,
  fmtPrice,
  fmtQty,
  parseRuDate,
  yearsLabel,
} from "./format";
import { buildPoints, buildSparkPoints, genSeries, tickDates, tickerSeed } from "./series";

/** Позиция + рассчитанные по ней величины (базовый кирпич для всех вкладок). */
export interface EnrichedHolding extends Holding {
  /** Текущая стоимость позиции в валюте счёта. */
  value: number;
  /** Вложено (qty × средняя цена) в валюте счёта. */
  cost: number;
  /** Изменение стоимости за день в деньгах. */
  dayAbs: number;
  /** Нереализованный P&L в деньгах и в процентах. */
  plAbs: number;
  plPct: number;
}

export const getAccount = (accounts: Account[], id: string): Account =>
  accounts.find((a) => a.id === id) ?? accounts[0];

// Стоимость / вложено с конвертацией валютных бумаг в валюту счёта.
// fx берётся из позиции (реальный курс в live), иначе запасные 92 ₽/$.
const valueOf = (h: Holding, acc: Account) => {
  const cur = h.currency ?? acc.currency;
  let v = h.qty * h.price;
  if (acc.currency === "RUB" && cur !== "RUB") v *= h.fx ?? 92;
  return v;
};
const costOf = (h: Holding, acc: Account) => {
  const cur = h.currency ?? acc.currency;
  let v = h.qty * h.avgPrice;
  if (acc.currency === "RUB" && cur !== "RUB") v *= h.fx ?? 92;
  return v;
};

/** Позиции → позиции с value/cost/dayAbs/plAbs/plPct. Отправная точка почти всех селекторов. */
export function enrich(list: Holding[], acc: Account): EnrichedHolding[] {
  return list.map((h) => {
    const value = valueOf(h, acc);
    const cost = costOf(h, acc);
    const plAbs = value - cost;
    return {
      ...h,
      value,
      cost,
      dayAbs: value * (h.dayChangePct / 100),
      plAbs,
      plPct: cost ? (plAbs / cost) * 100 : 0,
    };
  });
}

/** Сумма по портфелю: стоимость, изменение за день, вложено, P&L (деньги + %). Шапка. */
export function getTotals(enriched: EnrichedHolding[]) {
  const totalValue = enriched.reduce((s, h) => s + h.value, 0);
  const totalDayAbs = enriched.reduce((s, h) => s + h.dayAbs, 0);
  const totalCost = enriched.reduce((s, h) => s + h.cost, 0);
  const totalPlAbs = totalValue - totalCost;
  return {
    totalValue,
    totalDayAbs,
    totalCost,
    totalPlAbs,
    totalDayPct: totalValue - totalDayAbs ? (totalDayAbs / (totalValue - totalDayAbs)) * 100 : 0,
    totalPlPct: totalCost ? (totalPlAbs / totalCost) * 100 : 0,
  };
}

const changeColor = (n: number) => (n >= 0 ? POS : NEG);

// ── «Обзор» ─────────────────────────────────────────────────────────────────
/** Аллокация по классу актива → сегменты для бара + легенды (доля, цвет из PALETTE). */
export function getClassSegments(enriched: EnrichedHolding[], totalValue: number) {
  const groups: Record<string, number> = {};
  enriched.forEach((h) => (groups[h.cls] = (groups[h.cls] ?? 0) + h.value));
  return Object.entries(groups)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .map((c, i) => ({
      label: c.label,
      widthPct: totalValue ? (c.value / totalValue) * 100 : 0,
      pctLabel: fmtPct(totalValue ? (c.value / totalValue) * 100 : 0).replace("+", ""),
      color: PALETTE[i % PALETTE.length],
    }));
}

/** 4 бумаги с наибольшим |изменением за день| для карточки «Топ движения дня».
 *  `points` пустой, пока не подгрузились свечи (в live). `uid` — чтобы их заказать. */
export function getTopMovers(enriched: EnrichedHolding[], acc: Account) {
  return enriched
    .filter((h) => !h.isCash)
    .slice()
    .sort((a, b) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct))
    .slice(0, 4)
    .map((h) => ({
      ticker: h.ticker,
      name: h.name,
      uid: h.instrumentUid ?? null,
      priceLabel: fmtPrice(h.price, h.currency ?? acc.currency),
      pctLabel: fmtPct(h.dayChangePct),
      pctColor: changeColor(h.dayChangePct),
      arrow: arrow(h.dayChangePct),
      points: h.spark.length ? buildSparkPoints(h.spark, 56, 24) : "",
    }));
}

const FX_RUB = 92; // запасной курс, если у операции нет своего

/** Сумма дивидендов+купонов за последний месяц (карточка «Дивиденды и купоны» на «Обзоре»).
 *  В live фильтрует по `_ts`; в демо (`_ts` нет) берёт всё. */
export function getDividendMonthTotal(operations: Tx[]) {
  const cutoff = Date.now() - 31 * 86400000;
  return operations
    .filter((t) => t.type === "dividend" || t.type === "coupon")
    .filter((t) => !t._ts || new Date(t._ts).getTime() >= cutoff)
    .reduce((s, t) => s + (t.currency && t.currency !== "RUB" ? t.sum * FX_RUB : t.sum), 0);
}

// ── «Состав» ────────────────────────────────────────────────────────────────
/** Предикаты чипов фильтра (ключи совпадают с `FILTER_OPTIONS` из demo.ts). */
const FILTERS: Record<string, (h: EnrichedHolding) => boolean> = {
  all: () => true,
  stock_ru: (h) => h.cls === "Акции РФ",
  stock_us: (h) => h.cls === "Акции США",
  bond: (h) => h.cls === "Облигации",
  cash: (h) => h.cls === "Денежные средства",
};
/** Компараторы сортировки (ключи — из `SORT_OPTIONS`). */
const SORTS: Record<string, (a: EnrichedHolding, b: EnrichedHolding) => number> = {
  value_desc: (a, b) => b.value - a.value,
  day_desc: (a, b) => b.dayChangePct - a.dayChangePct,
  pl_desc: (a, b) => b.plAbs - a.plAbs,
  name_asc: (a, b) => a.name.localeCompare(b.name, "ru"),
};

/** Строки списка позиций с учётом текущего фильтра и сортировки. */
export function getHoldingRows(
  enriched: EnrichedHolding[],
  acc: Account,
  filter: string,
  sort: string,
) {
  return enriched
    .filter(FILTERS[filter] ?? FILTERS.all)
    .slice()
    .sort(SORTS[sort])
    .map((h) => ({
      ticker: h.ticker,
      name: h.name,
      qtyLabel: fmtQty(h),
      valueLabel: fmtMoney(h.value, acc.currency),
      pctLabel: h.isCash ? "—" : fmtPct(h.dayChangePct),
      pctColor: h.isCash ? "var(--color-text)" : changeColor(h.dayChangePct),
      arrow: h.isCash ? "" : arrow(h.dayChangePct),
    }));
}

// ── «Аллокация» ─────────────────────────────────────────────────────────────
/**
 * Группировка по измерению `dim` (класс / сектор / валюта) → сегменты доната
 * (через `stroke-dasharray`/`dashoffset`) + легенда. `circ` — длина окружности
 * кольца r=70; `cum` копит смещение для следующего сегмента.
 */
export function getAllocation(
  enriched: EnrichedHolding[],
  acc: Account,
  dim: "class" | "sector" | "currency",
  totalValue: number,
) {
  const keyOf = (h: EnrichedHolding) =>
    dim === "class"
      ? h.cls
      : dim === "sector"
        ? h.sector || "—"
        : (h.currency ?? (acc.currency === "USD" ? "USD" : "RUB"));
  const groups: Record<string, number> = {};
  enriched.forEach((h) => (groups[keyOf(h)] = (groups[keyOf(h)] ?? 0) + h.value));
  const arr = Object.entries(groups)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const circ = 2 * Math.PI * 70;
  let cum = 0;
  const denom = totalValue || 1;
  const donut = arr.map((g, i) => {
    const frac = g.value / denom;
    const seg = {
      dasharray: `${(frac * circ).toFixed(1)} ${((1 - frac) * circ).toFixed(1)}`,
      dashoffset: (-cum * circ).toFixed(1),
      color: PALETTE[i % PALETTE.length],
    };
    cum += frac;
    return seg;
  });
  const legend = arr.map((g, i) => ({
    label: g.label,
    valueLabel: fmtMoney(g.value, acc.currency),
    pctLabel: fmtPct((g.value / denom) * 100).replace("+", ""),
    color: PALETTE[i % PALETTE.length],
  }));
  return { donut, legend };
}

// ── «Динамика доходности» ───────────────────────────────────────────────────
// Два пути: `getPerformanceDemo` (синтетика из PERF_SEED) и `getPerformanceLive`
// (приблизительно из свечей). Оба возвращают один тип `PerfResult`, поэтому
// компонент `Performance.tsx` рисует их одинаково.

/** Подмножество UI-состояния, нужное вкладке «Динамика». */
export interface PerfState {
  perfPeriod: string;
  customFrom: string;
  customTo: string;
  customActive: boolean;
  showBenchmark: boolean;
  showInflation: boolean;
}

/** Готовые к рендеру данные вкладки: три polyline, оси, итоговые проценты, таблица. */
export interface PerfResult {
  benchName: string;
  portfolioPoints: string;
  benchmarkPoints: string;
  inflationPoints: string;
  zeroY: string;
  axisTicks: { label: string; x: string }[];
  portReturn: number;
  benchReturn: number;
  inflReturn: number;
  portfolioReturnLabel: string;
  benchReturnLabel: string;
  inflReturnLabel: string;
  periodLabel: string;
  hasInflation: boolean;
  outperformLabel: string;
  holdingsPeriodRows: {
    ticker: string;
    name: string;
    weightLabel: string;
    valueLabel: string;
    retLabel: string;
    retColor: string;
    ret: number;
  }[];
  approx: boolean;
}

/** Календарное окно периода для нарезки свечей (live). */
export const PERIOD_DAYS: Record<string, number> = {
  "1m": 31,
  "3m": 92,
  "6m": 183,
  "1y": 366,
  all: 3650,
};

/** Свечи одного инструмента: цены закрытия + их ISO-времена (провайдер грузит один раз на ~5 лет). */
export interface CandleData {
  closes: number[];
  times: string[];
}

/** Оставить только закрытия за последние `days` дней (≥2 точки, иначе последние две). */
function windowByDays(d: CandleData | undefined, days: number): number[] {
  if (!d?.closes.length) return [];
  const cutoff = Date.now() - days * 86400000;
  const out: number[] = [];
  for (let i = 0; i < d.closes.length; i++) {
    if (new Date(d.times[i]).getTime() >= cutoff) out.push(d.closes[i]);
  }
  return out.length >= 2 ? out : d.closes.slice(-2);
}

/** Текстовый вывод под графиком: «портфель обгоняет … на N п.п. и опережает инфляцию …». */
function outperform(benchName: string, portReturn: number, benchReturn: number, inflReturn: number | null) {
  const cmp = (a: number, b: number, up: string, down: string) => (a >= b ? up : down);
  let s =
    "За выбранный период портфель " +
    cmp(portReturn, benchReturn, "обгоняет ", "отстаёт от ") +
    benchName.toLowerCase() +
    " на " +
    Math.abs(portReturn - benchReturn).toFixed(1).replace(".", ",") +
    " п.п.";
  if (inflReturn != null) {
    s +=
      " и " +
      cmp(portReturn, inflReturn, "опережает инфляцию на ", "отстаёт от инфляции на ") +
      Math.abs(portReturn - inflReturn).toFixed(1).replace(".", ",") +
      " п.п.";
  }
  return s;
}

/**
 * ДЕМО: синтетические ряды из `PERF_SEED` (поведение прототипа без изменений).
 * Поддерживает произвольный диапазон дат (`customActive`), инфляцию, доходность
 * по каждой бумаге из её собственного seed.
 */
export function getPerformanceDemo(accountId: string, s: PerfState, totalValue: number): PerfResult {
  const account = ACCOUNTS.find((a) => a.id === accountId) ?? ACCOUNTS[0];
  const seed = PERF_SEED[account.id];
  const enriched = enrich(HOLDINGS[account.id], account);

  let customDays: number | null = null;
  if (s.customActive && s.customFrom && s.customTo) {
    customDays = Math.max(
      1,
      Math.round((new Date(s.customTo).getTime() - new Date(s.customFrom).getTime()) / 86400000),
    );
  }
  const per = customDays
    ? { len: Math.max(4, Math.min(30, Math.round(customDays / 7) + 2)), label: "Период" }
    : PERIODS[s.perfPeriod];

  const port = genSeries(per.len, seed.port.seed, seed.port.drift, seed.port.vol);
  const bench = genSeries(per.len, seed.bench.seed, seed.bench.drift, seed.bench.vol);
  const infl = genSeries(per.len, INFLATION_SEED.seed, INFLATION_SEED.drift, INFLATION_SEED.vol);

  const allVals = port.concat(s.showBenchmark ? bench : []).concat(s.showInflation ? infl : []);
  const minV = Math.min(...allVals, 0);
  const maxV = Math.max(...allVals, 0);

  const tickLabels = customDays
    ? Array.from({ length: 5 }, (_, i) => {
        const f = new Date(s.customFrom).getTime();
        const t = new Date(s.customTo).getTime();
        return fmtDateShort(new Date(f + (t - f) * (i / 4)));
      })
    : tickDates(s.perfPeriod);

  const portReturn = port[port.length - 1];
  const benchReturn = bench[bench.length - 1];
  const inflReturn = infl[infl.length - 1];

  const holdingsPeriodRows = enriched
    .filter((h) => !h.isCash)
    .map((h) => {
      const ser = genSeries(
        per.len,
        tickerSeed(h.ticker),
        h.dayChangePct * 0.9,
        1.4 + Math.abs(h.dayChangePct) * 0.3,
      );
      const ret = ser[ser.length - 1];
      return {
        ticker: h.ticker,
        name: h.name,
        weightLabel: fmtPct((h.value / totalValue) * 100).replace("+", ""),
        valueLabel: fmtMoney(h.value, account.currency),
        retLabel: fmtPct(ret),
        retColor: changeColor(ret),
        ret,
      };
    })
    .sort((a, b) => b.ret - a.ret);

  return {
    benchName: seed.benchName,
    portfolioPoints: buildPoints(port, minV, maxV, 280, 140, 10),
    benchmarkPoints: buildPoints(bench, minV, maxV, 280, 140, 10),
    inflationPoints: buildPoints(infl, minV, maxV, 280, 140, 10),
    zeroY: (140 - 10 - ((0 - minV) / (maxV - minV || 1)) * (140 - 20)).toFixed(1),
    axisTicks: tickLabels.map((label, i) => ({
      label,
      x: (tickLabels.length === 1 ? 0 : (i / (tickLabels.length - 1)) * 280).toFixed(1),
    })),
    portReturn,
    benchReturn,
    inflReturn,
    portfolioReturnLabel: fmtPct(portReturn),
    benchReturnLabel: fmtPct(benchReturn),
    inflReturnLabel: fmtPct(inflReturn),
    periodLabel: customDays ? "выбранный период" : per.label,
    hasInflation: true,
    outperformLabel: outperform(seed.benchName, portReturn, benchReturn, inflReturn),
    holdingsPeriodRows,
    approx: false,
  };
}

/** Массив закрытий → доходность к первой точке в %, [0, r1, r2, …]. */
const pctReturns = (closes: number[]) => {
  if (closes.length < 2 || !closes[0]) return [];
  return closes.map((c) => (c / closes[0] - 1) * 100);
};

/**
 * LIVE: в API нет готового ряда «стоимость портфеля во времени», поэтому строим
 * ПРИБЛИЖЁННО:
 *   P(t) = Σᵢ wᵢ · rᵢ(t),  где wᵢ — текущая доля бумаги, rᵢ — доходность её свечей.
 * Бенчмарк — свечи индекса МосБиржи. Линии инфляции нет (нет источника).
 * В UI помечается как приблизительная (`approx: true`).
 *
 * Ряды бумаг разной длины (разные торговые календари, даты листинга) —
 * ресэмплим каждый к фиксированным `N` точкам линейной интерполяцией по индексу.
 * Крайние точки сохраняются, поэтому итоговая доходность за период — точная.
 */
export function getPerformanceLive(
  enriched: EnrichedHolding[],
  s: PerfState,
  candlesByUid: Record<string, CandleData>,
  benchmark: CandleData | null,
  benchName: string,
): PerfResult {
  const days = PERIOD_DAYS[s.perfPeriod] ?? 183;
  const win = (uid: string) => windowByDays(candlesByUid[uid], days);
  // только бумаги, по которым есть ≥2 свечи в окне — остальные в кривую не входят
  const invested = enriched.filter(
    (h) => !h.isCash && h.instrumentUid && win(h.instrumentUid).length >= 2,
  );
  const investedValue = invested.reduce((sum, h) => sum + h.value, 0) || 1;

  const N = 80; // точек в выровненных рядах
  const resample = (a: number[]) => {
    if (a.length <= 1) return a.slice();
    return Array.from({ length: N }, (_, i) => {
      const pos = (i / (N - 1)) * (a.length - 1);
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      return a[lo] + (a[hi] - a[lo]) * (pos - lo);
    });
  };

  const series = invested.map((h) => ({
    w: h.value / investedValue,
    r: resample(pctReturns(win(h.instrumentUid!))),
  }));
  const benchR = resample(pctReturns(windowByDays(benchmark ?? undefined, days)));

  const port: number[] =
    series.length && series[0].r.length
      ? Array.from({ length: N }, (_, t) => series.reduce((sum, x) => sum + x.w * (x.r[t] ?? 0), 0))
      : [];
  const bench = s.showBenchmark && benchR.length >= 2 ? benchR : [];

  const allVals = port.concat(bench).concat([0]);
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);

  const portReturn = port.length ? port[port.length - 1] : 0;
  const benchReturn = bench.length ? bench[bench.length - 1] : 0;

  const nTicks = 4;
  const axisTicks = Array.from({ length: nTicks }, (_, i) => {
    const back = days * (1 - i / (nTicks - 1));
    return {
      label: fmtDateShort(new Date(Date.now() - back * 86400000)),
      x: ((i / (nTicks - 1)) * 280).toFixed(1),
    };
  });

  const holdingsPeriodRows = enriched
    .filter((h) => !h.isCash)
    .map((h) => {
      const r = h.instrumentUid ? pctReturns(win(h.instrumentUid)) : [];
      const ret = r.length ? r[r.length - 1] : 0;
      return {
        ticker: h.ticker,
        name: h.name,
        weightLabel: fmtPct((h.value / (investedValue || 1)) * 100).replace("+", ""),
        valueLabel: fmtMoney(h.value, "RUB"),
        retLabel: r.length ? fmtPct(ret) : "н/д",
        retColor: changeColor(ret),
        ret,
      };
    })
    .sort((a, b) => b.ret - a.ret);

  return {
    benchName,
    portfolioPoints: port.length ? buildPoints(port, minV, maxV, 280, 140, 10) : "",
    benchmarkPoints: bench.length ? buildPoints(bench, minV, maxV, 280, 140, 10) : "",
    inflationPoints: "",
    zeroY: (140 - 10 - ((0 - minV) / (maxV - minV || 1)) * (140 - 20)).toFixed(1),
    axisTicks,
    portReturn,
    benchReturn,
    inflReturn: 0,
    portfolioReturnLabel: fmtPct(portReturn),
    benchReturnLabel: fmtPct(benchReturn),
    inflReturnLabel: "",
    periodLabel: PERIODS[s.perfPeriod]?.label ?? "период",
    hasInflation: false,
    outperformLabel: outperform(benchName, portReturn, benchReturn, null),
    holdingsPeriodRows,
    approx: true,
  };
}

// ── «История операций» ──────────────────────────────────────────────────────
/** Операции + фильтр по типу → строки списка: знак суммы, цвет, тег, примечание. */
export function getHistory(operations: Tx[], filter: string, accountCurrency: "RUB" | "USD") {
  return operations
    .filter((t) => filter === "all" || t.type === filter)
    .map((t) => {
      const isIn = t.type === "sell" || t.type === "dividend" || t.type === "coupon";
      const isPayout = t.type === "dividend" || t.type === "coupon";
      return {
        dateLabel: t.date,
        typeLabel: TX_TYPE_LABEL[t.type],
        tagClass: TX_TAG_CLASS[t.type],
        tickerName: t.ticker,
        amountLabel: (isIn ? "+" : "−") + fmtMoney(t.sum, t.currency ?? accountCurrency),
        amountColor: isPayout ? POS : "var(--color-text)",
        noteLabel:
          t.note ??
          (t.qty ? `${t.qty} × ${fmtPrice(t.price ?? 0, t.currency ?? accountCurrency)}` : ""),
        hasNote: !!(t.note || t.qty),
      };
    });
}

// ── Полноэкранная карточка бумаги ───────────────────────────────────────────
/** Опциональные ленивые данные карточки (в live подгружаются при её открытии). */
export interface DetailOpts {
  /** Свечи бумаги для графика цены. */
  candleCloses?: number[];
  /** График/история купонов облигации (`GetBondCoupons`). */
  bondCoupons?: BondCoupons;
}

/**
 * Всё для карточки одной бумаги: цена, график, средняя, P&L, сектор, для акций —
 * див. доходность, для облигаций — купоны (плановые + история), «Об эмитенте»,
 * сделки и выплаты по бумаге. Живые данные предпочитаются демо-таблицам
 * (`BOND_INFO` / `ISSUER_INFO`), которые остаются фолбэком.
 */
export function getDetail(
  holdings: Holding[],
  operations: Tx[],
  account: Account,
  ticker: string,
  opts: DetailOpts = {},
) {
  const enriched = enrich(holdings, account);
  const h = enriched.find((x) => x.ticker === ticker);
  if (!h) return null;
  const cur = h.currency ?? account.currency;

  const matches = (t: Tx) =>
    t.ticker === h.ticker || (h.instrumentUid && t.instrumentUid === h.instrumentUid);

  const relatedTx = operations
    .filter((t) => matches(t) && (t.type === "buy" || t.type === "sell"))
    .map((t) => ({
      dateLabel: t.date,
      typeLabel: TX_TYPE_LABEL[t.type],
      tagClass: TX_TAG_CLASS[t.type],
      amountLabel: (t.type === "sell" ? "+" : "−") + fmtMoney(t.sum, t.currency ?? account.currency),
    }));
  const relatedDiv = operations
    .filter((t) => matches(t) && (t.type === "dividend" || t.type === "coupon"))
    .map((t) => ({
      dateLabel: t.date,
      noteLabel: t.note ?? "",
      rawSum: t.currency && t.currency !== "RUB" && account.currency === "RUB" ? t.sum * (h.fx ?? 92) : t.sum,
      amountLabel: "+" + fmtMoney(t.sum, t.currency ?? account.currency),
    }));

  const isEquity = h.cls === "Акции РФ" || h.cls === "Акции США";
  const isBond = h.cls === "Облигации";
  const divSum = relatedDiv.reduce((s, t) => s + t.rawSum, 0);

  // bond details: prefer live coupons, else the demo BOND_INFO table
  const demoBond = BOND_INFO[h.ticker] ?? null;
  const live = opts.bondCoupons ?? null;
  const now = Date.now();
  const futureCoupons = (live?.coupons ?? [])
    .filter((c) => new Date(c.date).getTime() >= now)
    .slice(0, 4);
  const pastCoupons = (live?.coupons ?? [])
    .filter((c) => new Date(c.date).getTime() < now)
    .slice(-6)
    .reverse();

  const hasBond =
    isBond && (!!demoBond || !!(live && (live.couponRatePct != null || live.coupons.length)));

  const issuer =
    ISSUER_INFO[h.ticker] ??
    (h.isin
      ? { isin: h.isin, exchange: h.exchange ?? h.kind ?? "—", desc: "" }
      : null);

  const points = opts.candleCloses?.length
    ? buildSparkPoints(opts.candleCloses, 280, 100)
    : h.spark.length
      ? buildSparkPoints(h.spark, 280, 100)
      : "";

  return {
    ticker: h.ticker,
    name: h.name,
    cls: h.cls,
    sector: h.sector,
    priceLabel: fmtPrice(h.price, cur),
    dayChangeLabel: fmtPct(h.dayChangePct),
    dayChangeColor: changeColor(h.dayChangePct),
    dayArrow: arrow(h.dayChangePct),
    qtyLabel: fmtQty(h),
    avgPriceLabel: fmtPrice(h.avgPrice, cur),
    valueLabel: fmtMoney(h.value, account.currency),
    plLabel: (h.plAbs >= 0 ? "+" : "") + fmtMoney(h.plAbs, account.currency),
    plColor: changeColor(h.plAbs),
    plPctLabel: fmtPct(h.plPct),
    points,
    relatedTx,
    hasTx: relatedTx.length > 0,
    relatedDiv,
    hasDiv: relatedDiv.length > 0 && !isBond,
    isEquity,
    divYieldLabel: (h.value ? (divSum / h.value) * 100 : 0).toFixed(1).replace(".", ",") + "%",
    lastDivLabel: relatedDiv[0] ? fmtMoney(relatedDiv[0].rawSum, account.currency) : "—",
    lastDivDateLabel: relatedDiv[0] ? relatedDiv[0].dateLabel : "",
    issuer,
    hasIssuer: !!issuer,
    hasBond,
    couponRateLabel: live?.couponRatePct != null
      ? live.couponRatePct.toFixed(1).replace(".", ",") + "%"
      : demoBond
        ? demoBond.couponRatePct.toFixed(1).replace(".", ",") + "%"
        : "",
    couponPerBondLabel: live?.couponPerBond != null
      ? live.couponPerBond.toFixed(2).replace(".", ",") + " ₽"
      : demoBond
        ? demoBond.couponPerBond.toFixed(2).replace(".", ",") + " ₽"
        : "",
    faceValueLabel: live?.faceValue != null
      ? Math.round(live.faceValue).toLocaleString("ru-RU") + " ₽"
      : demoBond
        ? demoBond.faceValue.toLocaleString("ru-RU") + " ₽"
        : "",
    couponHistory: live
      ? pastCoupons.map((c) => ({
          dateLabel: fmtDateShort(new Date(c.date)),
          amountLabel: "+" + fmtMoney(c.payOneBond * h.qty, account.currency),
        }))
      : relatedDiv.map((d) => ({
          dateLabel: d.dateLabel,
          amountLabel: "+" + fmtMoney(d.rawSum, account.currency),
        })),
    couponScheduleRows: live
      ? futureCoupons.map((c) => ({
          dateLabel: fmtDateShort(new Date(c.date)),
          amountLabel: fmtMoney(c.payOneBond * h.qty, account.currency),
        }))
      : demoBond
        ? Array.from({ length: 4 }, (_, i) => {
            const d = new Date(ANCHOR_DATE.getTime() + (i + 1) * demoBond.frequencyDays * 86400000);
            return {
              dateLabel: fmtDateShort(d),
              amountLabel: fmtMoney(demoBond.couponPerBond * h.qty, account.currency),
            };
          })
        : [],
    maturityLabel: live?.maturity
      ? fmtDateShort(new Date(live.maturity)) + "." + new Date(live.maturity).getFullYear()
      : demoBond
        ? demoBond.maturity
        : "",
    maturityYearsLabel: live?.maturity
      ? yearsLabel(daysBetween(new Date(), new Date(live.maturity)))
      : demoBond
        ? yearsLabel(daysBetween(ANCHOR_DATE, parseRuDate(demoBond.maturity)))
        : "",
    hasOffer: !!demoBond?.offerDate,
    offerYearsLabel:
      demoBond && demoBond.offerDate
        ? yearsLabel(daysBetween(ANCHOR_DATE, parseRuDate(demoBond.offerDate)))
        : "",
  };
}
