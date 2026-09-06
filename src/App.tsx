/**
 * Корневой компонент. Рамка «телефона» → по `status`:
 *   loading → спиннер
 *   auth    → <LoginScreen>
 *   demo    → баннер «демо-данные» + обычный интерфейс
 *   live    → обычный интерфейс
 * Интерфейс = фиксированная <Header> + скроллируемая активная вкладка + <BottomNav>,
 * поверх — боттом-шиты и полноэкранная карточка бумаги (по флагам из store).
 */
import { BottomNav } from "./components/BottomNav";
import { DetailOverlay } from "./components/DetailOverlay";
import { Header } from "./components/Header";
import { LoginScreen } from "./components/LoginScreen";
import { AccountSheet, SortSheet } from "./components/Sheets";
import { Allocation } from "./components/tabs/Allocation";
import { History } from "./components/tabs/History";
import { Holdings } from "./components/tabs/Holdings";
import { Overview } from "./components/tabs/Overview";
import { Performance } from "./components/tabs/Performance";
import { usePortfolioData } from "./data/PortfolioDataProvider";
import { useStore } from "./store";

const TABS = {
  overview: Overview,
  holdings: Holdings,
  allocation: Allocation,
  performance: Performance,
  history: History,
};

export function App() {
  const { state } = useStore();
  const { status, mode, error } = usePortfolioData();
  const TabView = TABS[state.activeTab];

  return (
    <div className="stage">
      <div className="device">
        <div className="screen">
          {status === "loading" ? (
            <div className="screen-center">
              <div className="spinner" />
              <div style={{ fontSize: 13, opacity: 0.55 }}>Загрузка портфеля…</div>
            </div>
          ) : status === "auth" ? (
            <LoginScreen />
          ) : (
            <>
              {mode === "demo" && (
                <div className="demo-banner">
                  Демо-данные{error ? ` · ${error}` : ""}. Запустите прокси:{" "}
                  <code>npm run server</code> (нужен <code>app/.env</code>).
                </div>
              )}
              <Header />
              <div className="scroll-area">
                <TabView />
              </div>
              <BottomNav />

              {state.accountSheetOpen && <AccountSheet />}
              {state.sortSheetOpen && <SortSheet />}
              {state.selectedTicker && <DetailOverlay />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
