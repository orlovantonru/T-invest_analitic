import { usePortfolioData } from "../data/PortfolioDataProvider";
import { enrich, getTotals } from "../lib/portfolio";
import { fmtMoney, fmtPct, arrow } from "../lib/format";
import { useStore } from "../store";
import { ChevronDown } from "./Icons";

export function Header() {
  const { set } = useStore();
  const { account, holdings, portfolioLoading, apiTotalValue } = usePortfolioData();
  const enriched = enrich(holdings, account);
  const t = getTotals(enriched);
  const totalValue = apiTotalValue ?? t.totalValue;

  return (
    <header className="app-header">
      <button className="account-selector" onClick={() => set({ accountSheetOpen: true })}>
        <span>
          {account.broker} · {account.type}
        </span>
        <ChevronDown style={{ opacity: 0.5 }} />
      </button>
      {portfolioLoading ? (
        <div className="skeleton" style={{ height: 36, width: 220, margin: "6px 0" }} />
      ) : (
        <div className="total-value">{fmtMoney(totalValue, account.currency)}</div>
      )}
      <div className="change-row">
        <span style={{ color: t.totalDayAbs >= 0 ? "var(--pos)" : "var(--neg)" }}>
          {arrow(t.totalDayAbs)} {fmtMoney(Math.abs(t.totalDayAbs), account.currency)} ·{" "}
          {fmtPct(t.totalDayPct)} <span style={{ opacity: 0.55 }}>за день</span>
        </span>
        <span style={{ color: t.totalPlAbs >= 0 ? "var(--pos)" : "var(--neg)" }}>
          {arrow(t.totalPlAbs)} {fmtMoney(Math.abs(t.totalPlAbs), account.currency)} ·{" "}
          {fmtPct(t.totalPlPct)} <span style={{ opacity: 0.55 }}>всего</span>
        </span>
      </div>
    </header>
  );
}
