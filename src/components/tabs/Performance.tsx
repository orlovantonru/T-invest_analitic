// Вкладка «Динамика доходности»: чипы периода, график портфель / бенчмарк /
// инфляция (три polyline), итоговые проценты, таблица доходности по бумагам.
// live → getPerformanceLive (заказывает свечи всех бумаг + бенчмарк, помечает
// кривую как приблизительную); demo → getPerformanceDemo (+ произвольный диапазон).
import { useEffect } from "react";
import { PERIODS } from "../../data/demo";
import { usePortfolioData } from "../../data/PortfolioDataProvider";
import { fmtDateShort } from "../../lib/format";
import {
  enrich,
  getPerformanceDemo,
  getPerformanceLive,
  getTotals,
} from "../../lib/portfolio";
import { useStore } from "../../store";
import { Calendar } from "../Icons";

export function Performance() {
  const { state, set } = useStore();
  const { mode, account, holdings, candles, benchmark, benchName, ensureCandles, ensureBenchmark } =
    usePortfolioData();
  const enriched = enrich(holdings, account);
  const { totalValue } = getTotals(enriched);

  useEffect(() => {
    if (mode === "live") {
      ensureCandles(holdings.map((h) => h.instrumentUid));
      ensureBenchmark();
    }
  }, [mode, holdings, ensureCandles, ensureBenchmark]);

  const p =
    mode === "live"
      ? getPerformanceLive(enriched, state, candles, benchmark, benchName)
      : getPerformanceDemo(state.accountId, state, totalValue);

  const rangeActive = state.customActive;
  const rangeLabel =
    rangeActive && state.customFrom && state.customTo
      ? `${fmtDateShort(new Date(state.customFrom))} – ${fmtDateShort(new Date(state.customTo))}`
      : "Диапазон…";

  return (
    <div className="tab-body">
      <div className="section-title" style={{ marginBottom: 12 }}>
        Динамика доходности
      </div>

      <div className="chip-row" style={{ marginBottom: 12 }}>
        {Object.entries(PERIODS).map(([key, cfg]) => {
          const active = !state.customActive && state.perfPeriod === key;
          return (
            <button
              key={key}
              className={"chip" + (active ? " active" : "")}
              onClick={() => set({ perfPeriod: key, customActive: false })}
            >
              {cfg.label}
            </button>
          );
        })}
        {mode === "demo" && (
          <button
            className={"chip" + (rangeActive ? " active" : "")}
            style={{ display: "flex", alignItems: "center", gap: 5 }}
            onClick={() => set({ customRangeOpen: !state.customRangeOpen })}
          >
            <Calendar />
            {rangeLabel}
          </button>
        )}
      </div>

      {mode === "demo" && state.customRangeOpen && (
        <div
          className="card"
          style={{
            padding: "14px 16px",
            marginBottom: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", gap: 10 }}>
            <label style={{ flex: 1, fontSize: 12 }}>
              <div style={{ opacity: 0.55, marginBottom: 4 }}>С даты</div>
              <input
                type="date"
                className="input"
                value={state.customFrom}
                onChange={(e) => set({ customFrom: e.target.value })}
              />
            </label>
            <label style={{ flex: 1, fontSize: 12 }}>
              <div style={{ opacity: 0.55, marginBottom: 4 }}>По дату</div>
              <input
                type="date"
                className="input"
                value={state.customTo}
                onChange={(e) => set({ customTo: e.target.value })}
              />
            </label>
          </div>
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              if (state.customFrom && state.customTo)
                set({ customActive: true, customRangeOpen: false });
            }}
          >
            Применить
          </button>
        </div>
      )}

      <div className="card" style={{ padding: "16px 14px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
            marginBottom: 8,
            fontSize: 12,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-accent-700)" }}>
            <span style={{ width: 16, height: 2, background: "var(--color-accent-700)" }} />
            Портфель
          </span>
          <button
            onClick={() => set({ showBenchmark: !state.showBenchmark })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              opacity: state.showBenchmark ? 1 : 0.4,
              background: "none",
              border: 0,
              cursor: "pointer",
              color: "inherit",
              fontSize: 12,
            }}
          >
            <span style={{ width: 16, borderTop: "2px dashed var(--color-neutral-600)" }} />
            {p.benchName}
          </button>
          {p.hasInflation && (
            <button
              onClick={() => set({ showInflation: !state.showInflation })}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                opacity: state.showInflation ? 1 : 0.4,
                background: "none",
                border: 0,
                cursor: "pointer",
                color: "inherit",
                fontSize: 12,
              }}
            >
              <span style={{ width: 16, borderTop: "1.5px dotted var(--color-neutral-500)" }} />
              Инфляция
            </button>
          )}
        </div>

        <svg width="100%" height={140} viewBox="0 0 280 140" preserveAspectRatio="none">
          <line
            x1={0}
            y1={p.zeroY}
            x2={280}
            y2={p.zeroY}
            stroke="var(--color-divider)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          {state.showBenchmark && (
            <polyline
              points={p.benchmarkPoints}
              fill="none"
              stroke="var(--color-neutral-600)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {p.hasInflation && state.showInflation && (
            <polyline
              points={p.inflationPoints}
              fill="none"
              stroke="var(--color-neutral-500)"
              strokeWidth={1.5}
              strokeDasharray="1 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          <polyline
            points={p.portfolioPoints}
            fill="none"
            stroke="var(--color-accent-700)"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {p.axisTicks.map((t, i) => (
            <line
              key={i}
              x1={t.x}
              y1={132}
              x2={t.x}
              y2={140}
              stroke="var(--color-neutral-500)"
              strokeWidth={1}
            />
          ))}
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
          {p.axisTicks.map((t, i) => (
            <span key={i} style={{ fontSize: 10, opacity: 0.5 }}>
              {t.label}
            </span>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: 8,
            marginTop: 10,
            fontSize: 13,
          }}
        >
          <div>
            <span style={{ opacity: 0.55 }}>Портфель </span>
            <span
              className="num"
              style={{ fontWeight: 600, color: p.portReturn >= 0 ? "var(--pos)" : "var(--neg)" }}
            >
              {p.portfolioReturnLabel}
            </span>
          </div>
          <div>
            <span style={{ opacity: 0.55 }}>{p.benchName} </span>
            <span
              className="num"
              style={{ fontWeight: 600, color: p.benchReturn >= 0 ? "var(--pos)" : "var(--neg)" }}
            >
              {p.benchReturnLabel}
            </span>
          </div>
          {p.hasInflation && (
            <div>
              <span style={{ opacity: 0.55 }}>Инфляция </span>
              <span className="num" style={{ fontWeight: 600, color: "var(--color-neutral-600)" }}>
                {p.inflReturnLabel}
              </span>
            </div>
          )}
        </div>
      </div>

      <p style={{ fontSize: 12.5, opacity: 0.65, marginTop: 14, textAlign: "justify" }}>
        {p.outperformLabel}
      </p>
      {p.approx && (
        <div className="approx-note">
          Кривая портфеля приблизительная: дневная доходность бумаг, взвешенная по текущей доле.
        </div>
      )}

      <div className="section-title" style={{ fontSize: 16, margin: "22px 0 10px" }}>
        Состав и доходность по бумагам, {p.periodLabel}
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Бумага</th>
            <th style={{ textAlign: "right" }}>Доля</th>
            <th style={{ textAlign: "right" }}>Стоимость</th>
            <th style={{ textAlign: "right" }}>Доходность</th>
          </tr>
        </thead>
        <tbody>
          {p.holdingsPeriodRows.map((r) => (
            <tr key={r.ticker}>
              <td>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.ticker}</div>
                <div style={{ fontSize: 11, opacity: 0.55 }}>{r.name}</div>
              </td>
              <td className="num" style={{ textAlign: "right", fontSize: 12.5 }}>
                {r.weightLabel}
              </td>
              <td className="num" style={{ textAlign: "right", fontSize: 12.5 }}>
                {r.valueLabel}
              </td>
              <td
                className="num"
                style={{ textAlign: "right", fontSize: 12.5, color: r.retColor }}
              >
                {r.retLabel}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
