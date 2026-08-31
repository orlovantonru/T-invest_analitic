import { useEffect } from "react";
import { HISTORY_FILTERS } from "../../data/demo";
import { usePortfolioData } from "../../data/PortfolioDataProvider";
import { getHistory } from "../../lib/portfolio";
import { useStore } from "../../store";
import { ChipRow } from "../Chips";

export function History() {
  const { state, set } = useStore();
  const { account, operations, ensureOperations } = usePortfolioData();

  useEffect(() => {
    ensureOperations();
  }, [ensureOperations]);

  const rows = operations
    ? getHistory(operations, state.historyFilter, account.currency)
    : null;

  return (
    <div className="tab-body">
      <div className="section-title" style={{ marginBottom: 12 }}>
        История операций
      </div>

      <ChipRow
        chips={HISTORY_FILTERS}
        active={state.historyFilter}
        onSelect={(k) => set({ historyFilter: k })}
      />

      <div className="card" style={{ padding: "4px 14px" }}>
        {rows == null ? (
          [0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton" style={{ height: 38, margin: "11px 0" }} />
          ))
        ) : rows.length === 0 ? (
          <div style={{ padding: "18px 0", fontSize: 13, opacity: 0.5, textAlign: "center" }}>
            Нет операций за период
          </div>
        ) : (
          rows.map((t, i) => (
            <div key={i} className="list-row">
              <div style={{ flex: "none", fontSize: 11, opacity: 0.5, width: 40 }}>{t.dateLabel}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span className={t.tagClass}>{t.typeLabel}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t.tickerName}</span>
                </div>
                {t.hasNote && (
                  <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>{t.noteLabel}</div>
                )}
              </div>
              <div className="num" style={{ fontSize: 13.5, color: t.amountColor, flex: "none" }}>
                {t.amountLabel}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
