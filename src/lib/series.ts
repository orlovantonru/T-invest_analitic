import { ANCHOR_DATE, PERIOD_SPANS } from "../data/demo";
import { fmtDateShort } from "./format";

// Deterministic pseudo-series generator (ported from the prototype). Produces a
// smooth cumulative curve from a seed/drift/vol triple — stands in for real
// historical return data.
export function genSeries(len: number, seed: number, drift: number, vol: number): number[] {
  let v = 0;
  const out = [0];
  for (let i = 1; i < len; i++) {
    v = v + drift + Math.sin((i + seed) * 1.7) * vol + Math.cos(i * 0.9 + seed) * vol * 0.4;
    out.push(+v.toFixed(2));
  }
  return out;
}

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

export function tickerSeed(t: string): number {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 97;
  return h / 97;
}

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
