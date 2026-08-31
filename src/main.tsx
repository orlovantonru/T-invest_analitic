import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";
import { StoreProvider } from "./store";
import { PortfolioDataProvider } from "./data/PortfolioDataProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <PortfolioDataProvider>
        <App />
      </PortfolioDataProvider>
    </StoreProvider>
  </StrictMode>,
);
