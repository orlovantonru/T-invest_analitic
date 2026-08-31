import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ProxyError, type BondCoupons } from "../api/client";
import {
  ACCOUNTS,
  HOLDINGS,
  PERF_SEED,
  TX,
  type Account,
  type Holding,
  type Tx,
} from "./demo";
import type { CandleData } from "../lib/portfolio";
import { useStore } from "../store";

type Status = "loading" | "live" | "demo" | "auth";

interface Value {
  status: Status;
  mode: "live" | "demo";
  error?: string;
  authEnabled: boolean;
  retryAuth: () => void;
  logout: () => void;
  accounts: Account[];
  account: Account;
  holdings: Holding[];
  portfolioLoading: boolean;
  apiTotalValue: number | null;
  operations: Tx[] | null;
  benchName: string;
  candles: Record<string, CandleData>;
  benchmark: CandleData | null;
  bondCoupons: Record<string, BondCoupons>;
  ensureOperations: () => void;
  ensureCandles: (uids: (string | null | undefined)[]) => void;
  ensureBenchmark: () => void;
  ensureSectors: () => void;
  ensureBondCoupons: (uid: string) => void;
}

const Ctx = createContext<Value | null>(null);

const CANDLE_DAYS = 1825; // ~5y (DAY-interval API limit is 6y); sliced per period client-side

interface LiveState {
  holdings: Holding[];
  apiTotalValue: number;
  benchName: string;
}

export function PortfolioDataProvider({ children }: { children: ReactNode }) {
  const { state, set } = useStore();
  const { accountId } = state;

  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string>();
  const [authEnabled, setAuthEnabled] = useState(false);
  const [bootKey, setBootKey] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>(ACCOUNTS);
  const [portfolios, setPortfolios] = useState<Record<string, LiveState>>({});
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [operationsByAccount, setOperationsByAccount] = useState<Record<string, Tx[]>>({});
  const [candles, setCandles] = useState<Record<string, CandleData>>({});
  const [benchmark, setBenchmark] = useState<CandleData | null>(null);
  const [sectors, setSectors] = useState<Record<string, string>>({});
  const [bondCoupons, setBondCoupons] = useState<Record<string, BondCoupons>>({});

  const mode: "live" | "demo" = status === "live" ? "live" : "demo";
  const inflight = useRef<Set<string>>(new Set());

  const toDemo = useCallback(() => {
    setAccounts(ACCOUNTS);
    setStatus("demo");
    if (!ACCOUNTS.some((a) => a.id === accountId)) set({ accountId: ACCOUNTS[0].id });
  }, [accountId, set]);

  // ── bootstrap: check session → accounts → first portfolio ───────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("loading");
      setError(undefined);
      try {
        const me = await api.me();
        if (cancelled) return;
        setAuthEnabled(me.authEnabled);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ProxyError && e.status === 401) {
          setAuthEnabled(true);
          setStatus("auth");
          return;
        }
        // network error / proxy down → local demo mode
        toDemo();
        return;
      }
      try {
        const accs = await api.accounts();
        if (cancelled) return;
        if (!accs.length) {
          toDemo();
          setError("нет доступных счетов");
          return;
        }
        setAccounts(accs);
        setStatus("live");
        if (!accs.some((a) => a.id === accountId)) set({ accountId: accs[0].id });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ProxyError && e.status === 401) {
          setStatus("auth");
          return;
        }
        toDemo();
        if (e instanceof ProxyError) setError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootKey]);

  const retryAuth = useCallback(() => setBootKey((k) => k + 1), []);
  const logout = useCallback(() => {
    api.logout().finally(() => {
      setPortfolios({});
      setOperationsByAccount({});
      setCandles({});
      setBenchmark(null);
      setStatus("auth");
    });
  }, []);

  // ── load portfolio for the active account (live only) ───────────────────────
  useEffect(() => {
    if (status !== "live" || portfolios[accountId]) return;
    let cancelled = false;
    setPortfolioLoading(true);
    api
      .portfolio(accountId)
      .then((p) => {
        if (cancelled) return;
        setPortfolios((prev) => ({
          ...prev,
          [accountId]: {
            holdings: p.holdings,
            apiTotalValue: p.apiTotalValue,
            benchName: p.benchName,
          },
        }));
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ProxyError && e.status === 401) setStatus("auth");
        else setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setPortfolioLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, accountId, portfolios]);

  // ── background: sparklines + operations once the first portfolio is in ──────
  const live = status === "live" ? portfolios[accountId] : undefined;

  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  const opsRef = useRef(operationsByAccount);
  opsRef.current = operationsByAccount;

  const ensureCandles = useCallback((uids: (string | null | undefined)[]) => {
    for (const uid of new Set(uids.filter((u): u is string => !!u))) {
      const key = `candle:${uid}`;
      if (candlesRef.current[uid] || inflight.current.has(key)) continue;
      inflight.current.add(key);
      api
        .candles(uid, CANDLE_DAYS)
        .then((c) => setCandles((p) => ({ ...p, [uid]: { closes: c.closes, times: c.times } })))
        .catch(() => {})
        .finally(() => inflight.current.delete(key));
    }
  }, []);

  const ensureOperations = useCallback(() => {
    if (status !== "live") return;
    const key = `ops:${accountId}`;
    if (opsRef.current[accountId] || inflight.current.has(key)) return;
    inflight.current.add(key);
    api
      .operations(accountId, 200)
      .then((ops) => setOperationsByAccount((p) => ({ ...p, [accountId]: ops })))
      .catch(() => {})
      .finally(() => inflight.current.delete(key));
  }, [status, accountId]);

  const ensureBenchmark = useCallback(() => {
    if (status !== "live") return;
    const key = "benchmark";
    if (benchmark || inflight.current.has(key)) return;
    inflight.current.add(key);
    api
      .benchmarkCandles(CANDLE_DAYS)
      .then((c) => setBenchmark({ closes: c.closes, times: c.times }))
      .catch(() => {})
      .finally(() => inflight.current.delete(key));
  }, [status, benchmark]);

  const ensureSectors = useCallback(() => {
    if (status !== "live" || !live) return;
    const missing = live.holdings.filter(
      (h) => h.instrumentUid && !h.isCash && !sectors[h.instrumentUid],
    );
    if (!missing.length) return;
    const key = `sectors:${accountId}`;
    if (inflight.current.has(key)) return;
    inflight.current.add(key);
    api
      .sectors(missing.map((h) => ({ uid: h.instrumentUid as string, kind: h.kind || "share" })))
      .then((map) => setSectors((p) => ({ ...p, ...map })))
      .catch(() => {})
      .finally(() => inflight.current.delete(key));
  }, [status, live, sectors, accountId]);

  const ensureBondCoupons = useCallback(
    (uid: string) => {
      if (status !== "live" || bondCoupons[uid]) return;
      const key = `coupons:${uid}`;
      if (inflight.current.has(key)) return;
      inflight.current.add(key);
      api
        .bondCoupons(uid)
        .then((c) => setBondCoupons((p) => ({ ...p, [uid]: c })))
        .catch(() => {})
        .finally(() => inflight.current.delete(key));
    },
    [status, bondCoupons],
  );

  useEffect(() => {
    if (status !== "live" || !live) return;
    ensureOperations();
    const movers = [...live.holdings]
      .filter((h) => !h.isCash)
      .sort((a, b) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct))
      .slice(0, 4)
      .map((h) => h.instrumentUid);
    ensureCandles(movers);
  }, [status, live, ensureOperations, ensureCandles]);

  // ── derived: current account view ──────────────────────────────────────────
  const account = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? accounts[0],
    [accounts, accountId],
  );

  const holdings = useMemo<Holding[]>(() => {
    const base = mode === "live" ? (live?.holdings ?? []) : (HOLDINGS[accountId] ?? []);
    return base.map((h) => {
      const uid = h.instrumentUid ?? undefined;
      const c = uid ? candles[uid] : undefined;
      return {
        ...h,
        sector: (uid && sectors[uid]) || h.sector,
        spark: c?.closes.length ? c.closes : h.spark,
      };
    });
  }, [mode, live, accountId, candles, sectors]);

  const operations = useMemo<Tx[] | null>(() => {
    if (mode === "demo") return TX[accountId] ?? [];
    return operationsByAccount[accountId] ?? null;
  }, [mode, accountId, operationsByAccount]);

  const benchName = useMemo(() => {
    if (mode === "live") return live?.benchName ?? "Индекс МосБиржи";
    return PERF_SEED[accountId]?.benchName ?? "Индекс МосБиржи";
  }, [mode, live, accountId]);

  const value: Value = {
    status,
    mode,
    error,
    authEnabled,
    retryAuth,
    logout,
    accounts,
    account,
    holdings,
    portfolioLoading: mode === "live" && (portfolioLoading || !live),
    apiTotalValue: mode === "live" ? (live?.apiTotalValue ?? null) : null,
    operations,
    benchName,
    candles,
    benchmark,
    bondCoupons,
    ensureOperations,
    ensureCandles,
    ensureBenchmark,
    ensureSectors,
    ensureBondCoupons,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePortfolioData(): Value {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePortfolioData must be used within PortfolioDataProvider");
  return ctx;
}
