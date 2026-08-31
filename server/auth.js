// Password + stateless-session auth for the proxy.
//
// - Password(s) come from the environment as scrypt hashes (see
//   scripts/hash-password.mjs). Single shared password -> APP_PASSWORD_HASH
//   (user "admin"); or APP_USERS='{"alice":"<hash>","bob":"<hash>"}'.
// - The session is a signed cookie (no server-side store), so container
//   restarts don't log anyone out.
// - If no password is configured, auth is OFF (local dev convenience). Docker
//   Compose always sets APP_PASSWORD_HASH, so production is always protected.

import crypto from "node:crypto";

const MAX_AGE_S = 30 * 24 * 60 * 60; // 30 days
const COOKIE = "sid";
const SECURE = process.env.NODE_ENV === "production";

// ── password store ───────────────────────────────────────────────────────────
function loadUsers() {
  if (process.env.APP_USERS) {
    try {
      return new Map(Object.entries(JSON.parse(process.env.APP_USERS)));
    } catch {
      console.error("[auth] APP_USERS is not valid JSON — ignoring");
    }
  }
  if (process.env.APP_PASSWORD_HASH) {
    return new Map([["admin", process.env.APP_PASSWORD_HASH.trim()]]);
  }
  return new Map();
}
const USERS = loadUsers();
export const AUTH_ENABLED = USERS.size > 0;

if (!AUTH_ENABLED) {
  console.warn("[auth] no APP_PASSWORD_HASH / APP_USERS set — /api is OPEN (dev mode)");
}

const SECRET =
  process.env.SESSION_SECRET?.trim() ||
  (AUTH_ENABLED
    ? (console.warn("[auth] SESSION_SECRET not set — using an ephemeral one (restart = logout)"),
      crypto.randomBytes(32).toString("hex"))
    : "dev");

/** scrypt hash "salt:hash" (both hex). */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(user, password) {
  const stored = USERS.get(user);
  if (!stored || !password) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  let derived;
  try {
    derived = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  } catch {
    return false;
  }
  const expected = Buffer.from(hashHex, "hex");
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

// ── signed cookie sessions ───────────────────────────────────────────────────
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const sign = (payloadB64) =>
  crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");

export function mintCookie(user) {
  const payload = b64u(JSON.stringify({ u: user, iat: Math.floor(Date.now() / 1000) }));
  const value = `${payload}.${sign(payload)}`;
  const attrs = [
    `${COOKIE}=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${MAX_AGE_S}`,
    SECURE ? "Secure" : "",
  ].filter(Boolean);
  return attrs.join("; ");
}

export function clearCookie() {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${SECURE ? "; Secure" : ""}`;
}

/** -> { user } if the request carries a valid session (or auth is disabled), else null. */
export function readSession(cookieHeader) {
  if (!AUTH_ENABLED) return { user: "local" };
  const raw = (cookieHeader || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const value = raw.slice(COOKIE.length + 1);
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const payloadB64 = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = sign(payloadB64);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
    return null;
  }
  let data;
  try {
    data = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!data?.u || typeof data.iat !== "number") return null;
  if (Date.now() / 1000 - data.iat > MAX_AGE_S) return null;
  return { user: data.u };
}

// ── brute-force limiter (per IP, in-memory) ──────────────────────────────────
const attempts = new Map(); // ip -> { fails, until }
const MAX_FAILS = 10;
const LOCK_MS = 15 * 60 * 1000;

export function loginAllowed(ip) {
  const a = attempts.get(ip);
  if (!a) return true;
  if (a.until && Date.now() < a.until) return false;
  if (a.until && Date.now() >= a.until) attempts.delete(ip);
  return true;
}
export function noteLoginFail(ip) {
  const a = attempts.get(ip) || { fails: 0, until: 0 };
  a.fails++;
  if (a.fails >= MAX_FAILS) a.until = Date.now() + LOCK_MS;
  attempts.set(ip, a);
}
export function noteLoginOk(ip) {
  attempts.delete(ip);
}
