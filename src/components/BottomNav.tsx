import { useStore, type Tab } from "../store";
import {
  NavAllocation,
  NavHistory,
  NavHoldings,
  NavOverview,
  NavPerformance,
} from "./Icons";

const ITEMS: { tab: Tab; label: string; Icon: React.ComponentType }[] = [
  { tab: "overview", label: "Обзор", Icon: NavOverview },
  { tab: "holdings", label: "Состав", Icon: NavHoldings },
  { tab: "allocation", label: "Аллокация", Icon: NavAllocation },
  { tab: "performance", label: "Динамика", Icon: NavPerformance },
  { tab: "history", label: "История", Icon: NavHistory },
];

export function BottomNav() {
  const { state, set } = useStore();
  return (
    <nav className="bottom-nav">
      {ITEMS.map(({ tab, label, Icon }) => {
        const active = state.activeTab === tab;
        return (
          <button
            key={tab}
            className={"nav-item" + (active ? " active" : "")}
            onClick={() => set({ activeTab: tab })}
          >
            <Icon />
            <span>{label}</span>
            {active && <span className="nav-dot" />}
          </button>
        );
      })}
    </nav>
  );
}
