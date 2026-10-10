// Demo-grade auth (P0): a role code exchanged for a short-lived HMAC-signed token.
// Codes and the signing secret come from environment variables only (R12).

import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError, type Req } from "./http.ts";

export type Role = "student" | "worker" | "manager";
const ROLES: Role[] = ["student", "worker", "manager"];
const TTL_MS = 12 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set and at least 32 characters");
  return s;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function issue(role: Role) {
  const exp = Date.now() + TTL_MS;
  const payload = b64(JSON.stringify({ role, exp }));
  return { token: `${payload}.${sign(payload)}`, role, expiresAt: new Date(exp).toISOString() };
}

/**
 * One-click demo login for judges (DEMO_MODE=true). Safe only because every record in
 * the demo is simulated and a manager can reset it; turn it off for real hostel data.
 */
export function demoLogin(body: unknown): { token: string; role: Role; expiresAt: string } {
  if (process.env.DEMO_MODE !== "true") throw new HttpError(403, "FORBIDDEN", "Demo login is turned off.");
  const role = (body as { role?: string } | null)?.role;
  if (!role || !ROLES.includes(role as Role)) throw new HttpError(400, "VALIDATION_ERROR", "role must be student, worker or manager.", "role");
  return issue(role as Role);
}

export function login(body: unknown): { token: string; role: Role; expiresAt: string } {
  const b = (body ?? {}) as { role?: string; code?: string };
  if (!b.role || !ROLES.includes(b.role as Role)) throw new HttpError(400, "VALIDATION_ERROR", "role must be student, worker or manager.", "role");
  if (typeof b.code !== "string" || !b.code) throw new HttpError(400, "VALIDATION_ERROR", "code is required.", "code");
  const expected = process.env[`ROLE_CODE_${b.role.toUpperCase()}`];
  if (!expected || !safeEqual(b.code, expected)) throw new HttpError(401, "UNAUTHENTICATED", "Wrong code for this role.");
  return issue(b.role as Role);
}

export function authenticate(req: Req): Role {
  const h = req.headers["authorization"] ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) throw new HttpError(401, "UNAUTHENTICATED", "Sign in first.");
  const { role, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (typeof exp !== "number" || exp < Date.now()) throw new HttpError(401, "UNAUTHENTICATED", "Session expired. Sign in again.");
  return role as Role;
}

export function requireRole(req: Req, allowed: Role[]): Role {
  const role = authenticate(req);
  if (!allowed.includes(role)) throw new HttpError(403, "FORBIDDEN", `This needs one of: ${allowed.join(", ")}.`);
  return role;
}
