import type { Holding } from "../data/demo";

export const fmtRUB = (n: number) => Math.round(n).toLocaleString("ru-RU") + " ₽";
export const fmtUSD = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const symbolFor = (cur?: string) =>
  cur === "USD" ? "$" : cur === "EUR" ? "€" : cur && cur !== "RUB" ? ` ${cur}` : " ₽";
export const fmtMoney = (n: number, cur?: string) =>
  cur === "USD" ? fmtUSD(n) : cur && cur !== "RUB" ? Math.round(n).toLocaleString("ru-RU") + symbolFor(cur) : fmtRUB(n);

export const fmtPriceRUB = (n: number) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₽";
export const fmtPriceUSD = (n: number) => "$" + n.toFixed(2);
export const fmtPrice = (n: number, cur?: string) =>
  cur === "USD"
    ? fmtPriceUSD(n)
    : cur && cur !== "RUB"
      ? n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + symbolFor(cur)
      : fmtPriceRUB(n);

export const fmtPct = (n: number) =>
  (n >= 0 ? "+" : "") + n.toFixed(1).replace(".", ",") + "%";

export const fmtQty = (h: Holding) =>
  h.isCash
    ? h.qty.toLocaleString("ru-RU") + " " + (h.currency === "USD" ? "$" : "₽")
    : h.qty + " шт";

export const fmtDateShort = (d: Date) =>
  String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0");

export const parseRuDate = (s: string) => {
  const p = s.split(".");
  return new Date(+p[2], +p[1] - 1, +p[0]);
};

export const daysBetween = (a: Date, b: Date) =>
  Math.round((b.getTime() - a.getTime()) / 86400000);

export const yearsLabel = (days: number) => {
  const y = days / 365;
  return y >= 1 ? y.toFixed(1).replace(".", ",") + " лет" : days + " дн.";
};

export const arrow = (n: number) => (n >= 0 ? "▲" : "▼");
