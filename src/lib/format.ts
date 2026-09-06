/**
 * Отображение чисел, денег и дат. Единый стиль для всего UI:
 *  - валюта в локали `ru-RU` (разделитель тысяч — неразрывный пробел),
 *  - проценты и купонные ставки — запятая как десятичный разделитель («+4,1%»),
 *  - крупные суммы округляются до рубля, цены бумаг — 2 знака после запятой.
 * Функции чистые, без состояния — их зовут и селекторы (`lib/portfolio.ts`),
 * и компоненты напрямую.
 */
import type { Holding } from "../data/demo";

export const fmtRUB = (n: number) => Math.round(n).toLocaleString("ru-RU") + " ₽";
export const fmtUSD = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
/** Символ/суффикс валюты: $, €, « CODE» для прочих, « ₽» по умолчанию. */
const symbolFor = (cur?: string) =>
  cur === "USD" ? "$" : cur === "EUR" ? "€" : cur && cur !== "RUB" ? ` ${cur}` : " ₽";

/** Крупная сумма (стоимость позиции, тотал портфеля). `cur` — код валюты счёта. */
export const fmtMoney = (n: number, cur?: string) =>
  cur === "USD" ? fmtUSD(n) : cur && cur !== "RUB" ? Math.round(n).toLocaleString("ru-RU") + symbolFor(cur) : fmtRUB(n);

export const fmtPriceRUB = (n: number) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₽";
export const fmtPriceUSD = (n: number) => "$" + n.toFixed(2);
/** Цена одной бумаги — всегда с двумя знаками после запятой. */
export const fmtPrice = (n: number, cur?: string) =>
  cur === "USD"
    ? fmtPriceUSD(n)
    : cur && cur !== "RUB"
      ? n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + symbolFor(cur)
      : fmtPriceRUB(n);

/** Процент со знаком и запятой: 4.05 → «+4,1%», -2 → «-2,0%». */
export const fmtPct = (n: number) =>
  (n >= 0 ? "+" : "") + n.toFixed(1).replace(".", ",") + "%";

/** Количество: «400 шт» для бумаг, «156 780 ₽/$» для денежной позиции. */
export const fmtQty = (h: Holding) =>
  h.isCash
    ? h.qty.toLocaleString("ru-RU") + " " + (h.currency === "USD" ? "$" : "₽")
    : h.qty + " шт";

/** Дата → «дд.мм» (день/месяц без года — как на оси графика). */
export const fmtDateShort = (d: Date) =>
  String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0");

/** «дд.мм.гггг» (демо-данные облигаций) → Date. */
export const parseRuDate = (s: string) => {
  const p = s.split(".");
  return new Date(+p[2], +p[1] - 1, +p[0]);
};

export const daysBetween = (a: Date, b: Date) =>
  Math.round((b.getTime() - a.getTime()) / 86400000);

/** Срок: «2,4 лет» если ≥ года, иначе «180 дн.» (до погашения/оферты облигации). */
export const yearsLabel = (days: number) => {
  const y = days / 365;
  return y >= 1 ? y.toFixed(1).replace(".", ",") + " лет" : days + " дн.";
};

/** Треугольник направления для изменений цены. */
export const arrow = (n: number) => (n >= 0 ? "▲" : "▼");
