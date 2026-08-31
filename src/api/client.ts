// Fetch wrappers for the local proxy (`app/server`). All calls are relative to
// `/api`, which Vite proxies to the Node process in dev.

import type { Account, Holding, Tx } from "../data/demo";

export interface LivePortfolio {
  account: Account;
  holdings: Holding[];
  apiTotalValue: number;
  benchName: string;
}

export interface CandleSeries {
  uid?: string;
  closes: number[];
  times: string[];
}

export interface BondCoupons {
  couponRatePct: number | null;
  couponPerBond: number | null;
  couponQuantityPerYear: number | null;
  coupons: { date: string; payOneBond: number; number: number }[];
  faceValue: number | null;
  maturity: string | null;
}

export class ProxyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e) {
    throw new ProxyError(0, e instanceof Error ? e.message : "network error");
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ProxyError(res.status, body?.error || `HTTP ${res.status}`);
  }
  return body as T;
}

const get = <T>(path: string, signal?: AbortSignal) => req<T>(`/api${path}`, { signal });

export const api = {
  me: () => req<{ user: string; authEnabled: boolean }>("/auth/me"),
  login: (user: string, password: string) =>
    req<{ user: string }>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password }),
    }),
  logout: () => req<unknown>("/auth/logout", { method: "POST" }),
  accounts: (signal?: AbortSignal) => get<Account[]>("/accounts", signal),
  portfolio: (accountId: string, signal?: AbortSignal) =>
    get<LivePortfolio>(`/portfolio?accountId=${encodeURIComponent(accountId)}`, signal),
  operations: (accountId: string, days = 180, signal?: AbortSignal) =>
    get<Tx[]>(`/operations?accountId=${encodeURIComponent(accountId)}&days=${days}`, signal),
  candles: (uid: string, days = 180, signal?: AbortSignal) =>
    get<CandleSeries>(`/candles?uid=${encodeURIComponent(uid)}&days=${days}`, signal),
  benchmarkCandles: (days = 180, signal?: AbortSignal) =>
    get<CandleSeries>(`/benchmark-candles?days=${days}`, signal),
  sectors: (items: { uid: string; kind: string }[], signal?: AbortSignal) =>
    get<Record<string, string>>(
      `/sectors?items=${encodeURIComponent(items.map((i) => `${i.uid}:${i.kind}`).join(","))}`,
      signal,
    ),
  bondCoupons: (uid: string, signal?: AbortSignal) =>
    get<BondCoupons>(`/bond-coupons?uid=${encodeURIComponent(uid)}`, signal),
};
