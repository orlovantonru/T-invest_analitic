import { FILTER_OPTIONS, SORT_OPTIONS } from "../../data/demo";
import { usePortfolioData } from "../../data/PortfolioDataProvider";
import { enrich, getHoldingRows } from "../../lib/portfolio";
import { useStore } from "../../store";
import { ChipRow } from "../Chips";
import { ListIcon } from "../Icons";

export function Holdings() {
  const { state, set } = useStore();
  const { account, holdings, portfolioLoading } = usePortfolioData();
  const enriched = enrich(holdings, account);
  const rows = getHoldingRows(enriched, account, state.holdingsFilter, state.holdingsSort);
  const sortLabel = SORT_OPTIONS.find((o) => o.key === state.holdingsSort)?.label ?? "";

  return (
    <div className="tab-body">
      <div style={{ marginBottom: 14 }}>
        <div className="section-title" style={{ lineHeight: 1.3 }}>
          Состав портфеля
        </div>
        <button
          onClick={() => set({ sortSheetOpen: true })}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 5,
            marginLeft: "auto",
            fontSize: 12,
            opacity: 0.7,
            marginTop: 6,
            background: "none",
            border: 0,
            color: "inherit",
            cursor: "pointer",
          }}
        >
          <ListIcon />
          <span>{sortLabel}</span>
        </button>
      </div>

      <ChipRow
        chips={FILTER_OPTIONS}
        active={state.holdingsFilter}
        onSelect={(k) => set({ holdingsFilter: k })}
      />

      {portfolioLoading ? (
        <div className="card" style={{ padding: "4px 14px" }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 40, margin: "10px 0" }} />
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: "4px 14px" }}>
          {rows.map((h) => (
            <button
              key={h.ticker}
              className="row-btn"
              onClick={() => set({ selectedTicker: h.ticker })}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="ticker" style={{ display: "block" }}>
                  {h.ticker}
                </span>
                <span className="sub" style={{ display: "block" }}>
                  {h.name} · {h.qtyLabel}
                </span>
              </span>
              <span style={{ textAlign: "right", flex: "none", lineHeight: 1.5 }}>
                <span className="num" style={{ display: "block", fontSize: 13.5 }}>
                  {h.valueLabel}
                </span>
                <span
                  className="num"
                  style={{ display: "block", fontSize: 11.5, color: h.pctColor }}
                >
                  {h.arrow} {h.pctLabel}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
