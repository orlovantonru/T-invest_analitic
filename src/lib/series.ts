/**
 * Математика графиков: генерация синтетических рядов (демо-режим) и перевод
 * массива чисел в строку `points` для SVG `<polyline>`. Ничего не рисует —
 * только считает координаты; сам SVG живёт в компонентах.
 */
import { ANCHOR_DATE, PERIOD_SPANS } from "../data/demo";
import { fmtDateShort } from "./format";

/**
 * Детерминированный псевдо-ряд (перенесён из прототипа). Из тройки
 * seed/drift/vol строит гладкую накопительную кривую — заменяет реальную
 * историю доходности в демо-режиме. Одинаковый вход → одинаковый выход.
 */
export function genSeries(len: number, seed: number, drift: number, vol: number): number[] {
  let v = 0;
  const out = [0];
  for (let i = 1; i < len; i++) {
    v = v + drift + Math.sin((i + seed) * 1.7) * vol + Math.cos(i * 0.9 + seed) * vol * 0.4;
    out.push(+v.toFixed(2));
  }
  return out;
}

/**
 * Массив значений → `points` для `<polyline>` в системе координат `w×h`.
 * `min`/`max` задаются снаружи, чтобы несколько линий (портфель, бенчмарк,
 * инфляция) были в одном масштабе. `padY` — вертикальные поля.
 */
export function buildPoints(
  arr: number[],
  min: number,
  max: number,
  w: number,
  h: number,
  padY: number,
): string {
  const range = max - min || 1;
  return arr
    .map((val, i) => {
      const x = arr.length === 1 ? 0 : (i / (arr.length - 1)) * w;
      const y = h - padY - ((val - min) / range) * (h - 2 * padY);
      return x.toFixed(1) + "," + y.toFixed(1);
    })
    .join(" ");
}

/** То же, но масштаб берётся из самого массива (мини-спарклайн в списке/карточке). */
export function buildSparkPoints(arr: number[], w: number, h: number): string {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min || 1;
  return arr
    .map((val, i) => {
      const x = arr.length === 1 ? 0 : (i / (arr.length - 1)) * w;
      const y = h - 2 - ((val - min) / range) * (h - 4);
      return x.toFixed(1) + "," + y.toFixed(1);
    })
    .join(" ");
}

/** Тикер → число в [0,1). Демо-режим: чтобы у каждой бумаги был свой стабильный ряд. */
export function tickerSeed(t: string): number {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 97;
  return h / 97;
}

/** Подписи оси времени для периода: N дат «дд.мм», отсчитанных назад от ANCHOR_DATE (демо). */
export function tickDates(periodKey: string): string[] {
  const cfg = PERIOD_SPANS[periodKey];
  const n = cfg.ticks;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const daysBack = cfg.days * (1 - i / (n - 1));
    out.push(fmtDateShort(new Date(ANCHOR_DATE.getTime() - daysBack * 86400000)));
  }
  return out;
}
