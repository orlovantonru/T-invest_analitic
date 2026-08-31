import { useState } from "react";
import { api, ProxyError } from "../api/client";
import { usePortfolioData } from "../data/PortfolioDataProvider";

export function LoginScreen() {
  const { retryAuth } = usePortfolioData();
  const [user, setUser] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setErr(undefined);
    try {
      await api.login(user || "admin", password);
      retryAuth();
    } catch (e) {
      if (e instanceof ProxyError && e.status === 429) setErr("Слишком много попыток. Подождите.");
      else if (e instanceof ProxyError && e.status === 401) setErr("Неверный логин или пароль");
      else setErr("Не удалось войти");
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="card-kicker">Анализ портфеля</div>
        <h1 className="login-title">Вход</h1>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 12 }}>
            <div style={{ opacity: 0.55, marginBottom: 4 }}>Пользователь</div>
            <input
              className="input"
              autoComplete="username"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
          </label>
          <label style={{ fontSize: 12 }}>
            <div style={{ opacity: 0.55, marginBottom: 4 }}>Пароль</div>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </label>
          {err && <div className="login-err">{err}</div>}
          <button className="btn btn-primary btn-block" disabled={busy || !password}>
            {busy ? "Вход…" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
