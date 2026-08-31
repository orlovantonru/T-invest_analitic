import { useEffect } from "react";
import { usePortfolioData } from "../data/PortfolioDataProvider";
import { getDetail } from "../lib/portfolio";
import { useStore } from "../store";
import { ChevronLeft } from "./Icons";

function Kicker({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="card-kicker" style={{ marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}

export function DetailOverlay() {
  const { state, set } = useStore();
  const { account, holdings, operations, candles, bondCoupons, ensureCandles, ensureBondCoupons, ensureOperations } =
    usePortfolioData();

  const ticker = state.selectedTicker;
  const holding = holdings.find((h) => h.ticker === ticker);
  const uid = holding?.instrumentUid ?? null;
  const isBond = holding?.cls === "Облигации";

  useEffect(() => {
    ensureOperations();
    if (uid) {
      ensureCandles([uid]);
      if (isBond) ensureBondCoupons(uid);
    }
  }, [uid, isBond, ensureCandles, ensureBondCoupons, ensureOperations]);

  if (!ticker) return null;
  const d = getDetail(holdings, operations ?? [], account, ticker, {
    candleCloses: uid ? candles[uid]?.closes : undefined,
    bondCoupons: uid ? bondCoupons[uid] : undefined,
  });
  if (!d) return null;

  const close = () => set({ selectedTicker: null });

  return (
    <div className="detail">
      <div className="detail-header">
        <button className="icon-btn" onClick={close} aria-label="Назад">
          <ChevronLeft />
        </button>
        <div>
          <div className="section-title">{d.ticker}</div>
          <div style={{ fontSize: 11.5, opacity: 0.55 }}>{d.name}</div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 20 }}>
        <div
          className="num"
          style={{
            fontSize: 30,
            lineHeight: 1.4,
            fontFamily: "var(--font-heading)",
            fontWeight: 600,
          }}
        >
          {d.priceLabel}
        </div>
        <div
          className="num"
          style={{ fontSize: 13, lineHeight: 1.6, color: d.dayChangeColor, marginTop: 2 }}
        >
          {d.dayArrow} {d.dayChangeLabel} <span style={{ opacity: 0.55 }}>за день</span>
        </div>

        <svg
          width="100%"
          height={100}
          viewBox="0 0 280 100"
          preserveAspectRatio="none"
          style={{ marginTop: 16 }}
        >
          <polyline
            points={d.points}
            fill="none"
            stroke="var(--color-accent-700)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div
          className="card"
          style={{
            marginTop: 18,
            padding: "14px 16px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "14px 10px",
          }}
        >
          <Kicker label="Количество" value={<span className="num">{d.qtyLabel}</span>} />
          <Kicker label="Средняя цена" value={<span className="num">{d.avgPriceLabel}</span>} />
          <Kicker label="Сектор" value={d.sector} />
          <Kicker label="Класс актива" value={d.cls} />
        </div>

        <div
          className="card"
          style={{
            marginTop: 14,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div className="card-kicker">Текущая стоимость</div>
            <div className="num" style={{ fontSize: 16, marginTop: 2 }}>
              {d.valueLabel}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="card-kicker">Нереализованный P&amp;L</div>
            <div className="num" style={{ fontSize: 16, color: d.plColor, marginTop: 2 }}>
              {d.plLabel} <span style={{ fontSize: 12 }}>({d.plPctLabel})</span>
            </div>
          </div>
        </div>

        {d.isEquity && (
          <div
            className="card"
            style={{
              marginTop: 14,
              padding: "14px 16px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "14px 10px",
            }}
          >
            <Kicker
              label="Див. доходность"
              value={
                <span className="num" style={{ color: "var(--color-accent-700)" }}>
                  {d.divYieldLabel}
                </span>
              }
            />
            <Kicker
              label="Последняя выплата"
              value={
                <span className="num">
                  {d.lastDivLabel}{" "}
                  <span style={{ opacity: 0.55, fontSize: 12 }}>{d.lastDivDateLabel}</span>
                </span>
              }
            />
          </div>
        )}

        {d.hasBond && (
          <>
            <div
              className="card"
              style={{
                marginTop: 14,
                padding: "14px 16px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "14px 10px",
              }}
            >
              <Kicker
                label="Ставка купона"
                value={
                  <span className="num" style={{ color: "var(--color-accent-700)" }}>
                    {d.couponRateLabel}
                  </span>
                }
              />
              <Kicker
                label="Купон на бумагу"
                value={<span className="num">{d.couponPerBondLabel}</span>}
              />
              <Kicker label="Номинал" value={<span className="num">{d.faceValueLabel}</span>} />
              <Kicker label="Погашение" value={d.maturityLabel || "—"} />
              <Kicker
                label={d.hasOffer ? "До оферты" : "До погашения"}
                value={d.hasOffer ? d.offerYearsLabel : d.maturityYearsLabel}
              />
            </div>

            <div className="section-title" style={{ fontSize: 16, margin: "20px 0 8px" }}>
              Плановые выплаты купонов
            </div>
            <div className="card" style={{ padding: "4px 14px" }}>
              {d.couponScheduleRows.map((c, i) => (
                <div
                  key={i}
                  className="list-row"
                  style={{ justifyContent: "space-between", padding: "10px 0" }}
                >
                  <div style={{ fontSize: 13, opacity: 0.7 }}>{c.dateLabel}</div>
                  <div className="num" style={{ fontSize: 13, color: "var(--color-accent-700)" }}>
                    {c.amountLabel}
                  </div>
                </div>
              ))}
            </div>

            {d.couponHistory.length > 0 && (
              <>
                <div className="section-title" style={{ fontSize: 16, margin: "20px 0 8px" }}>
                  История выплат купонов
                </div>
                <div className="card" style={{ padding: "4px 14px" }}>
                  {d.couponHistory.map((c, i) => (
                    <div
                      key={i}
                      className="list-row"
                      style={{ justifyContent: "space-between", padding: "10px 0" }}
                    >
                      <div style={{ fontSize: 13, opacity: 0.7 }}>{c.dateLabel}</div>
                      <div className="num" style={{ fontSize: 13 }}>
                        {c.amountLabel}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {d.hasIssuer && d.issuer && (
          <>
            <div className="section-title" style={{ fontSize: 16, margin: "20px 0 8px" }}>
              Об эмитенте
            </div>
            <div className="card" style={{ padding: "14px 16px" }}>
              <p style={{ fontSize: 13, opacity: 0.8, margin: "0 0 12px", textAlign: "justify" }}>
                {d.issuer.desc}
              </p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12.5,
                  paddingTop: 10,
                  borderTop: "1px solid var(--color-divider)",
                }}
              >
                <span style={{ opacity: 0.55 }}>ISIN</span>
                <span className="num">{d.issuer.isin}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12.5,
                  marginTop: 8,
                }}
              >
                <span style={{ opacity: 0.55 }}>Площадка</span>
                <span>{d.issuer.exchange}</span>
              </div>
            </div>
          </>
        )}

        {d.hasTx && (
          <>
            <div className="section-title" style={{ fontSize: 16, margin: "20px 0 8px" }}>
              Сделки по бумаге
            </div>
            <div className="card" style={{ padding: "4px 14px" }}>
              {d.relatedTx.map((t, i) => (
                <div key={i} className="list-row" style={{ padding: "10px 0" }}>
                  <div style={{ flex: "none", fontSize: 11, opacity: 0.5, width: 40 }}>
                    {t.dateLabel}
                  </div>
                  <span className={t.tagClass}>{t.typeLabel}</span>
                  <div style={{ flex: 1 }} />
                  <div className="num" style={{ fontSize: 13 }}>
                    {t.amountLabel}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {d.hasDiv && (
          <>
            <div className="section-title" style={{ fontSize: 16, margin: "20px 0 8px" }}>
              Дивиденды и купоны
            </div>
            <div className="card" style={{ padding: "4px 14px" }}>
              {d.relatedDiv.map((x, i) => (
                <div key={i} className="list-row" style={{ padding: "10px 0" }}>
                  <div style={{ flex: "none", fontSize: 11, opacity: 0.5, width: 40 }}>
                    {x.dateLabel}
                  </div>
                  <div style={{ flex: 1, fontSize: 12.5, opacity: 0.6 }}>{x.noteLabel}</div>
                  <div className="num" style={{ fontSize: 13, color: "var(--color-accent-700)" }}>
                    {x.amountLabel}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
