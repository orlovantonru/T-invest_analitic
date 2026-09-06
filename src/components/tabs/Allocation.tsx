// Вкладка «Аллокация»: сегментированный контрол (Класс / Сектор / Валюта),
// донат-диаграмма + легенда. При выборе «Сектор» — ленивая догрузка секторов.
import { useEffect } from "react";
import { usePortfolioData } from "../../data/PortfolioDataProvider";
import { fmtMoney } from "../../lib/format";
import { enrich, getAllocation, getTotals } from "../../lib/portfolio";
import { useStore } from "../../store";

const DIMS = [
  { key: "class", label: "Класс" },
  { key: "sector", label: "Сектор" },
  { key: "currency", label: "Валюта" },
] as const;

export function Allocation() {
  const { state, set } = useStore();
  const { account, holdings, portfolioLoading, ensureSectors } = usePortfolioData();

  useEffect(() => {
    if (state.allocationDim === "sector") ensureSectors();
  }, [state.allocationDim, ensureSectors]);

  const enriched = enrich(holdings, account);
  const { totalValue } = getTotals(enriched);
  const { donut, legend } = getAllocation(enriched, account, state.allocationDim, totalValue);

  return (
    <div className="tab-body">
      <div className="section-title" style={{ marginBottom: 12 }}>
        Аллокация
      </div>

      <div className="seg" style={{ marginBottom: 20 }}>
        {DIMS.map((d) => (
          <div
            key={d.key}
            className={"seg-opt" + (state.allocationDim === d.key ? " active" : "")}
            onClick={() => set({ allocationDim: d.key })}
          >
            {d.label}
          </div>
        ))}
      </div>

      {portfolioLoading ? (
        <div className="skeleton" style={{ height: 180, width: 180, borderRadius: "50%", margin: "0 auto 20px" }} />
      ) : (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              position: "relative",
              marginBottom: 20,
            }}
          >
            <svg width={180} height={180} viewBox="0 0 180 180">
              {donut.map((seg, i) => (
                <circle
                  key={i}
                  cx={90}
                  cy={90}
                  r={70}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={20}
                  strokeDasharray={seg.dasharray}
                  strokeDashoffset={seg.dashoffset}
                  transform="rotate(-90 90 90)"
                />
              ))}
            </svg>
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%,-50%)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  opacity: 0.5,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Всего
              </div>
              <div className="num" style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>
                {fmtMoney(totalValue, account.currency)}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: "6px 14px" }}>
            {legend.map((a) => (
              <div key={a.label} className="list-row">
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: a.color,
                    flex: "none",
                  }}
                />
                <span style={{ flex: 1, fontSize: 13.5 }}>{a.label}</span>
                <span className="num" style={{ fontSize: 13, opacity: 0.55, marginRight: 8 }}>
                  {a.valueLabel}
                </span>
                <span
                  className="num"
                  style={{ fontSize: 13, fontWeight: 600, minWidth: 44, textAlign: "right" }}
                >
                  {a.pctLabel}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
