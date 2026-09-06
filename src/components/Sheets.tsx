// Боттом-шиты: выбор счёта (+ кнопка «Выйти», если включён логин) и выбор
// сортировки «Состава». Открытие/закрытие — через флаги в store.
import { SORT_OPTIONS } from "../data/demo";
import { usePortfolioData } from "../data/PortfolioDataProvider";
import { fmtMoney } from "../lib/format";
import { enrich, getTotals } from "../lib/portfolio";
import { useStore } from "../store";
import { Check } from "./Icons";

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <button className="backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-grip" />
        <div className="sheet-title">{title}</div>
        {children}
      </div>
    </>
  );
}

export function AccountSheet() {
  const { set } = useStore();
  const { accounts, account, holdings, apiTotalValue, authEnabled, logout } = usePortfolioData();
  const currentValue =
    apiTotalValue ?? getTotals(enrich(holdings, account)).totalValue;

  return (
    <Sheet title="Счета" onClose={() => set({ accountSheetOpen: false })}>
      {accounts.map((a) => (
        <button
          key={a.id}
          className="row-btn"
          style={{ justifyContent: "space-between" }}
          onClick={() => set({ accountId: a.id, accountSheetOpen: false, selectedTicker: null })}
        >
          <span>
            <span style={{ fontSize: 14.5, fontWeight: 600, display: "block" }}>{a.broker}</span>
            <span style={{ fontSize: 12, opacity: 0.55 }}>
              {a.type}
              {a.id === account.id ? ` · ${fmtMoney(currentValue, a.currency)}` : ""}
            </span>
          </span>
          {a.id === account.id && <Check />}
        </button>
      ))}
      {authEnabled && (
        <button
          className="row-btn"
          style={{ marginTop: 6, color: "var(--neg)", fontSize: 14 }}
          onClick={() => {
            set({ accountSheetOpen: false });
            logout();
          }}
        >
          Выйти
        </button>
      )}
    </Sheet>
  );
}

export function SortSheet() {
  const { state, set } = useStore();
  return (
    <Sheet title="Сортировка" onClose={() => set({ sortSheetOpen: false })}>
      {SORT_OPTIONS.map((o) => (
        <button
          key={o.key}
          className="row-btn"
          style={{ justifyContent: "space-between" }}
          onClick={() => set({ holdingsSort: o.key, sortSheetOpen: false })}
        >
          <span style={{ fontSize: 14.5 }}>{o.label}</span>
          {state.holdingsSort === o.key && <Check />}
        </button>
      ))}
    </Sheet>
  );
}
