// Вкладка «Обзор»: аллокация по классу (бар + легенда), «Топ движения дня»
// (4 бумаги, спарклайны подгружаются лениво), карточка «Дивиденды и купоны».
import { usePortfolioData } from "../../data/PortfolioDataProvider";
import { fmtMoney } from "../../lib/format";
import {
  enrich,
  getClassSegments,
  getDividendMonthTotal,
  getTopMovers,
  getTotals,
} from "../../lib/portfolio";
import { useStore } from "../../store";
import { Sparkline } from "../Sparkline";

export function Overview() {
  const { set } = useStore();
  const { account, holdings, operations, portfolioLoading } = usePortfolioData();
  const enriched = enrich(holdings, account);
  const { totalValue } = getTotals(enriched);
  const segments = getClassSegments(enriched, totalValue);
  const movers = getTopMovers(enriched, account);
  const dividendMonth = operations ? getDividendMonthTotal(operations) : null;

  if (portfolioLoading) {
    return (
      <div className="tab-body">
        <div className="skeleton" style={{ height: 10, width: "100%", marginBottom: 16 }} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="tab-body">
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div className="section-title">Аллокация</div>
        <button className="link-accent" onClick={() => set({ activeTab: "allocation" })}>
          Все →
        </button>
      </div>

      <div
        style={{
          display: "flex",
          height: 10,
          borderRadius: 5,
          overflow: "hidden",
          border: "1px solid var(--color-divider)",
        }}
      >
        {segments.map((s) => (
          <div key={s.label} style={{ width: `${s.widthPct}%`, background: s.color }} />
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px 14px",
          marginTop: 12,
        }}
      >
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: s.color,
                flex: "none",
              }}
            />
            <span style={{ flex: 1 }}>{s.label}</span>
            <span className="num" style={{ opacity: 0.55 }}>
              {s.pctLabel}
            </span>
          </div>
        ))}
      </div>

      <div className="section-title" style={{ margin: "22px 0 10px" }}>
        Топ движения дня
      </div>
      <div className="card" style={{ padding: "6px 14px" }}>
        {movers.map((m) => (
          <button
            key={m.ticker}
            className="row-btn"
            onClick={() => set({ selectedTicker: m.ticker })}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="ticker" style={{ display: "block" }}>
                {m.ticker}
              </span>
              <span className="sub" style={{ display: "block" }}>
                {m.name}
              </span>
            </span>
            {m.points ? (
              <Sparkline points={m.points} color={m.pctColor} />
            ) : (
              <span className="skeleton" style={{ width: 56, height: 16, flex: "none" }} />
            )}
            <span style={{ textAlign: "right", flex: "none", minWidth: 64, lineHeight: 1.5 }}>
              <span className="num" style={{ display: "block", fontSize: 13 }}>
                {m.priceLabel}
              </span>
              <span
                className="num"
                style={{ display: "block", fontSize: 11.5, color: m.pctColor }}
              >
                {m.arrow} {m.pctLabel}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div
        className="card"
        style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px",
        }}
      >
        <div>
          <div className="card-kicker">За последнее время</div>
          <div className="card-title" style={{ fontSize: 16 }}>
            Дивиденды и купоны
          </div>
          <div
            className="num"
            style={{ fontSize: 13, color: "var(--color-accent-700)", marginTop: 2 }}
          >
            {dividendMonth == null ? "…" : `+${fmtMoney(dividendMonth, account.currency)}`}
          </div>
        </div>
        <button
          className="link-accent"
          onClick={() => set({ activeTab: "history", historyFilter: "dividend" })}
        >
          История →
        </button>
      </div>
    </div>
  );
}
