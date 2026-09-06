/**
 * Глобальное состояние ИНТЕРФЕЙСА (не данных): активная вкладка, выбранный счёт,
 * открытые боттом-шиты, фильтры/сортировки, параметры графика доходности.
 * Форма повторяет прототип `Портфель.dc.html`.
 *
 * Данные портфеля живут отдельно — в `PortfolioDataProvider`. Здесь только то,
 * что пользователь «накликал». Один reducer с действием `set` (мелкий патч);
 * компоненты вызывают `set({ ... })`.
 */
import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";

export type Tab = "overview" | "holdings" | "allocation" | "performance" | "history";

export interface AppState {
  activeTab: Tab;
  accountId: string;
  accountSheetOpen: boolean;
  sortSheetOpen: boolean;
  selectedTicker: string | null;
  holdingsFilter: string;
  holdingsSort: string;
  allocationDim: "class" | "sector" | "currency";
  perfPeriod: string;
  showBenchmark: boolean;
  showInflation: boolean;
  customRangeOpen: boolean;
  customFrom: string;
  customTo: string;
  customActive: boolean;
  historyFilter: string;
}

export const initialState: AppState = {
  activeTab: "overview",
  // демо-id счёта; в live-режиме провайдер подменит на первый реальный
  accountId: "nk-iis",
  accountSheetOpen: false,
  sortSheetOpen: false,
  selectedTicker: null,
  holdingsFilter: "all",
  holdingsSort: "value_desc",
  allocationDim: "class",
  perfPeriod: "3m",
  showBenchmark: true,
  showInflation: true,
  customRangeOpen: false,
  customFrom: "",
  customTo: "",
  customActive: false,
  historyFilter: "all",
};

type Action = { type: "set"; patch: Partial<AppState> };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "set":
      return { ...state, ...action.patch };
    default:
      return state;
  }
}

interface Ctx {
  state: AppState;
  set: (patch: Partial<AppState>) => void;
  dispatch: Dispatch<Action>;
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo<Ctx>(
    () => ({ state, dispatch, set: (patch) => dispatch({ type: "set", patch }) }),
    [state],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
