// Static demo dataset ported from Портфель.dc.html. In a real app this is
// replaced by broker-API data; everything derived (P&L, allocation, period
// returns, weights) is computed, never stored — see lib/portfolio.ts.

// Known asset-class labels the Holdings filter chips key off. Live data may also
// produce "Фонды" / "Прочее", which land in allocation but have no filter chip.
export type AssetClass = string;

export interface Account {
  id: string;
  broker: string;
  type: string;
  currency: "RUB" | "USD";
}

export interface Holding {
  ticker: string;
  name: string;
  cls: AssetClass;
  sector: string;
  qty: number;
  avgPrice: number;
  price: number;
  dayChangePct: number;
  spark: number[];
  currency?: string;
  fx?: number;
  isCash?: boolean;
  /** T-Invest instrument UID — present for live data, used for lazy candle/sector loads. */
  instrumentUid?: string | null;
  figi?: string | null;
  isin?: string | null;
  exchange?: string | null;
  kind?: string;
}

export type TxType = "buy" | "sell" | "dividend" | "coupon";

export interface Tx {
  date: string;
  type: TxType;
  ticker: string;
  name: string;
  sum: number;
  qty?: number;
  price?: number;
  note?: string;
  currency?: string;
  instrumentUid?: string | null;
  /** ISO timestamp — present for live data only. */
  _ts?: string;
}

export interface PerfSeed {
  port: { seed: number; drift: number; vol: number };
  bench: { seed: number; drift: number; vol: number };
  benchName: string;
}

export interface BondInfo {
  couponRatePct: number;
  couponPerBond: number;
  frequencyDays: number;
  faceValue: number;
  maturity: string;
  offerDate: string | null;
}

export interface IssuerInfo {
  isin: string;
  exchange: string;
  desc: string;
}

export const POS = "var(--pos)";
export const NEG = "var(--neg)";

export const PALETTE = [
  "var(--color-accent-700)",
  "var(--color-accent-400)",
  "var(--color-neutral-700)",
  "var(--color-accent-200)",
  "var(--color-neutral-400)",
  "var(--color-accent-900)",
];

export const ACCOUNTS: Account[] = [
  { id: "nk-iis", broker: "НРБанк", type: "ИИС", currency: "RUB" },
  { id: "nk-brok", broker: "НРБанк", type: "Брокерский", currency: "RUB" },
  { id: "vesta-fx", broker: "Vesta", type: "Брокерский · USD", currency: "USD" },
];

export const HOLDINGS: Record<string, Holding[]> = {
  "nk-iis": [
    { ticker: "SBER", name: "Сбербанк, ао", cls: "Акции РФ", sector: "Финансы", qty: 400, avgPrice: 245.1, price: 289.4, dayChangePct: 1.2, spark: [220, 228, 235, 231, 240, 255, 270, 289.4] },
    { ticker: "GAZP", name: "Газпром, ао", cls: "Акции РФ", sector: "Энергетика", qty: 600, avgPrice: 168.0, price: 152.3, dayChangePct: -0.6, spark: [178, 174, 170, 165, 160, 158, 155, 152.3] },
    { ticker: "LKOH", name: "Лукойл, ао", cls: "Акции РФ", sector: "Энергетика", qty: 20, avgPrice: 6540, price: 7120, dayChangePct: 0.4, spark: [6400, 6480, 6510, 6600, 6750, 6900, 7050, 7120] },
    { ticker: "GMKN", name: "Норникель, ао", cls: "Акции РФ", sector: "Металлургия", qty: 15, avgPrice: 14800, price: 15230, dayChangePct: 2.1, spark: [14600, 14700, 14750, 14680, 14900, 15000, 15100, 15230] },
    { ticker: "YDEX", name: "Яндекс", cls: "Акции РФ", sector: "Технологии", qty: 10, avgPrice: 3800, price: 4210, dayChangePct: -1.3, spark: [3700, 3800, 3950, 4100, 4300, 4250, 4260, 4210] },
    { ticker: "AAPL", name: "Apple Inc.", cls: "Акции США", sector: "Технологии", qty: 5, avgPrice: 180, price: 225, dayChangePct: 0.3, currency: "USD", fx: 92, spark: [195, 200, 205, 210, 215, 220, 222, 225] },
    { ticker: "OFZ26238", name: "ОФЗ 26238", cls: "Облигации", sector: "Гособлигации", qty: 300, avgPrice: 800, price: 812.5, dayChangePct: 0.1, spark: [790, 795, 798, 800, 805, 808, 810, 812.5] },
    { ticker: "RU000A106540", name: "Норникель БО-08", cls: "Облигации", sector: "Корпоративные облигации", qty: 150, avgPrice: 980, price: 996.2, dayChangePct: 0.05, spark: [975, 980, 985, 988, 990, 993, 995, 996.2] },
    { ticker: "RU000A105GH0", name: "ОФЗ 26240", cls: "Облигации", sector: "Гособлигации", qty: 200, avgPrice: 870, price: 882.4, dayChangePct: -0.15, spark: [890, 888, 885, 884, 882, 881, 880, 882.4] },
    { ticker: "RU000A103C05", name: "Сбербанк 001Р-SBER35", cls: "Облигации", sector: "Корпоративные облигации", qty: 100, avgPrice: 1010, price: 1024.8, dayChangePct: 0.08, spark: [1005, 1008, 1012, 1015, 1018, 1020, 1022, 1024.8] },
    { ticker: "RUB", name: "Денежные средства", cls: "Денежные средства", sector: "Кэш", qty: 156780, avgPrice: 1, price: 1, dayChangePct: 0, isCash: true, spark: [1, 1, 1, 1, 1, 1, 1, 1] },
  ],
  "nk-brok": [
    { ticker: "TATN", name: "Татнефть, ап", cls: "Акции РФ", sector: "Энергетика", qty: 50, avgPrice: 610, price: 655, dayChangePct: 0.8, spark: [600, 610, 615, 620, 630, 640, 648, 655] },
    { ticker: "MTLR", name: "Мечел, ао", cls: "Акции РФ", sector: "Металлургия", qty: 800, avgPrice: 120, price: 98, dayChangePct: -2.4, spark: [135, 130, 125, 118, 110, 105, 101, 98] },
    { ticker: "RUB", name: "Денежные средства", cls: "Денежные средства", sector: "Кэш", qty: 42500, avgPrice: 1, price: 1, dayChangePct: 0, isCash: true, spark: [1, 1, 1, 1, 1, 1, 1, 1] },
  ],
  "vesta-fx": [
    { ticker: "AAPL", name: "Apple Inc.", cls: "Акции США", sector: "Технологии", qty: 12, avgPrice: 170, price: 225, dayChangePct: 0.3, currency: "USD", spark: [190, 195, 200, 205, 210, 215, 220, 225] },
    { ticker: "MSFT", name: "Microsoft Corp.", cls: "Акции США", sector: "Технологии", qty: 8, avgPrice: 340, price: 415, dayChangePct: 1.1, currency: "USD", spark: [350, 360, 370, 385, 395, 405, 410, 415] },
    { ticker: "USD", name: "Денежные средства", cls: "Денежные средства", sector: "Кэш", qty: 3200, avgPrice: 1, price: 1, dayChangePct: 0, currency: "USD", isCash: true, spark: [1, 1, 1, 1, 1, 1, 1, 1] },
  ],
};

export const TX: Record<string, Tx[]> = {
  "nk-iis": [
    { date: "27 авг", type: "dividend", ticker: "SBER", name: "Сбербанк", sum: 11200, note: "28 ₽ на акцию" },
    { date: "22 авг", type: "buy", ticker: "YDEX", name: "Яндекс", qty: 2, price: 4150, sum: 8300 },
    { date: "15 авг", type: "coupon", ticker: "OFZ26238", name: "ОФЗ 26238", sum: 3675, note: "купон 12,25 ₽" },
    { date: "12 авг", type: "coupon", ticker: "RU000A106540", name: "Норникель БО-08", sum: 4260, note: "купон 28,4 ₽" },
    { date: "20 июл", type: "coupon", ticker: "RU000A105GH0", name: "ОФЗ 26240", sum: 4440, note: "купон 22,2 ₽" },
    { date: "09 авг", type: "sell", ticker: "GAZP", name: "Газпром", qty: 100, price: 158.4, sum: 15840 },
    { date: "02 авг", type: "buy", ticker: "GMKN", name: "Норникель", qty: 3, price: 14650, sum: 43950 },
    { date: "28 июл", type: "dividend", ticker: "LKOH", name: "Лукойл", sum: 9600, note: "480 ₽ на акцию" },
    { date: "19 июл", type: "buy", ticker: "SBER", name: "Сбербанк", qty: 100, price: 271.2, sum: 27120 },
    { date: "11 июл", type: "coupon", ticker: "OFZ26238", name: "ОФЗ 26238", sum: 3675, note: "купон 12,25 ₽" },
    { date: "03 июл", type: "sell", ticker: "YDEX", name: "Яндекс", qty: 1, price: 3980, sum: 3980 },
  ],
  "nk-brok": [
    { date: "20 авг", type: "buy", ticker: "TATN", name: "Татнефть", qty: 10, price: 632, sum: 6320 },
    { date: "05 авг", type: "sell", ticker: "MTLR", name: "Мечел", qty: 100, price: 112, sum: 11200 },
    { date: "22 июл", type: "dividend", ticker: "TATN", name: "Татнефть", sum: 2100, note: "42 ₽ на акцию" },
  ],
  "vesta-fx": [
    { date: "18 авг", type: "buy", ticker: "MSFT", name: "Microsoft", qty: 2, price: 402, sum: 804, currency: "USD" },
    { date: "02 авг", type: "dividend", ticker: "AAPL", name: "Apple", sum: 9.6, note: "$0.24 на акцию", currency: "USD" },
    { date: "14 июл", type: "buy", ticker: "AAPL", name: "Apple", qty: 4, price: 212, sum: 848, currency: "USD" },
  ],
};

export const PERF_SEED: Record<string, PerfSeed> = {
  "nk-iis": { port: { seed: 0.9, drift: 1.5, vol: 2.2 }, bench: { seed: 0.7, drift: 0.9, vol: 1.7 }, benchName: "Индекс МосБиржи" },
  "nk-brok": { port: { seed: 1.1, drift: -0.3, vol: 2.8 }, bench: { seed: 0.7, drift: 0.9, vol: 1.7 }, benchName: "Индекс МосБиржи" },
  "vesta-fx": { port: { seed: 0.6, drift: 1.9, vol: 2.3 }, bench: { seed: 0.5, drift: 1.3, vol: 1.9 }, benchName: "S&P 500" },
};

export const PERIODS: Record<string, { len: number; label: string }> = {
  "1m": { len: 8, label: "1М" },
  "3m": { len: 10, label: "3М" },
  "6m": { len: 12, label: "6М" },
  "1y": { len: 14, label: "1Г" },
  all: { len: 16, label: "Всё" },
};

export const PERIOD_SPANS: Record<string, { days: number; ticks: number }> = {
  "1m": { days: 30, ticks: 5 },
  "3m": { days: 90, ticks: 4 },
  "6m": { days: 180, ticks: 4 },
  "1y": { days: 365, ticks: 5 },
  all: { days: 730, ticks: 5 },
};

export const INFLATION_SEED = { seed: 0.3, drift: 0.65, vol: 0.25 };
export const ANCHOR_DATE = new Date(2026, 7, 29);

export const SORT_OPTIONS = [
  { key: "value_desc", label: "По стоимости (убыв.)" },
  { key: "day_desc", label: "По изменению за день" },
  { key: "pl_desc", label: "По прибыли" },
  { key: "name_asc", label: "По названию (А–Я)" },
] as const;

export const FILTER_OPTIONS = [
  { key: "all", label: "Все" },
  { key: "stock_ru", label: "Акции РФ" },
  { key: "stock_us", label: "Акции США" },
  { key: "bond", label: "Облигации" },
  { key: "cash", label: "Денежные средства" },
] as const;

export const HISTORY_FILTERS = [
  { key: "all", label: "Все" },
  { key: "buy", label: "Покупки" },
  { key: "sell", label: "Продажи" },
  { key: "dividend", label: "Дивиденды" },
  { key: "coupon", label: "Купоны" },
] as const;

export const TX_TYPE_LABEL: Record<TxType, string> = {
  buy: "Покупка",
  sell: "Продажа",
  dividend: "Дивиденд",
  coupon: "Купон",
};

export const TX_TAG_CLASS: Record<TxType, string> = {
  buy: "tag tag-outline",
  sell: "tag tag-neutral",
  dividend: "tag tag-accent",
  coupon: "tag tag-accent",
};

export const ISSUER_INFO: Record<string, IssuerInfo> = {
  SBER: { isin: "RU0009029540", exchange: "MOEX", desc: "Крупнейший банк России, контролирующая доля принадлежит государству." },
  GAZP: { isin: "RU0007661625", exchange: "MOEX", desc: "Газовая монополия, крупнейший в мире экспортёр природного газа." },
  LKOH: { isin: "RU0009024277", exchange: "MOEX", desc: "Одна из крупнейших вертикально-интегрированных нефтяных компаний." },
  GMKN: { isin: "RU0007288411", exchange: "MOEX", desc: "Крупнейший производитель никеля и палладия в мире." },
  YDEX: { isin: "RU000A106T10", exchange: "MOEX", desc: "Технологическая компания: поиск, сервисы, электронная коммерция." },
  AAPL: { isin: "US0378331005", exchange: "NASDAQ", desc: "Производитель потребительской электроники и программного обеспечения." },
  MSFT: { isin: "US5949181045", exchange: "NASDAQ", desc: "Разработчик программного обеспечения и облачных сервисов." },
  TATN: { isin: "RU0009033591", exchange: "MOEX", desc: "Вертикально-интегрированная нефтяная компания Республики Татарстан." },
  MTLR: { isin: "RU0009084396", exchange: "MOEX", desc: "Горно-металлургическая и добывающая компания." },
};

export const BOND_INFO: Record<string, BondInfo> = {
  OFZ26238: { couponRatePct: 7.1, couponPerBond: 12.25, frequencyDays: 182, faceValue: 1000, maturity: "15.05.2041", offerDate: null },
  RU000A106540: { couponRatePct: 11.4, couponPerBond: 28.4, frequencyDays: 91, faceValue: 1000, maturity: "20.03.2027", offerDate: null },
  RU000A105GH0: { couponRatePct: 8.9, couponPerBond: 22.2, frequencyDays: 182, faceValue: 1000, maturity: "30.07.2036", offerDate: null },
  RU000A103C05: { couponRatePct: 9.8, couponPerBond: 24.5, frequencyDays: 182, faceValue: 1000, maturity: "12.11.2028", offerDate: "12.11.2026" },
};
