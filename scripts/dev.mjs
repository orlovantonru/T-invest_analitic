// `npm run dev` — запускает прокси и Vite вместе.
// Если есть app/.env → поднимает и прокси (с `--watch`), иначе только Vite (демо-режим).
// Падение любого из процессов гасит второй.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hasEnv = existsSync(resolve(root, ".env"));
const isWin = process.platform === "win32";

const procs = [];
function run(name, cmd, args, useShell) {
  const p = spawn(cmd, args, { cwd: root, stdio: "inherit", shell: useShell });
  p.on("exit", (code) => {
    console.log(`\n[${name}] exited (${code}); shutting down.`);
    procs.forEach((x) => x !== p && x.kill());
    process.exit(code ?? 0);
  });
  procs.push(p);
}

if (hasEnv) {
  // node.exe path can contain spaces ("C:\Program Files\..."), so no shell here.
  run("proxy", process.execPath, ["--watch", "--env-file=.env", "server/index.js"], false);
} else {
  console.log(
    "[dev] no app/.env found — starting web only (demo data). Copy .env.example to .env for live data.",
  );
}
// npx needs a shell on Windows.
run("vite", isWin ? "npx.cmd" : "npx", ["vite"], isWin);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    procs.forEach((p) => p.kill());
    process.exit(0);
  });
}
