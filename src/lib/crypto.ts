import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * Key material. ENCRYPTION_KEY is preferred; when it is absent every key is
 * derived from the Supabase service key so a fresh deployment works with no
 * extra configuration. (Rotating whichever secret is in use invalidates stored
 * social tokens and outstanding invite links — people simply reconnect.)
 */
function derive(purpose: string): Buffer {
  const env = serverEnv();
  const root = env.encryptionKey || env.supabaseServiceKey;
  if (!root) throw new Error("No key material: set ENCRYPTION_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  return createHash("sha256").update(`bgs:${purpose}:${root}`).digest();
}

// ── AES-256-GCM for secrets at rest (social tokens, app credentials) ────────
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derive("secrets"), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const [version, iv, tag, body] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", derive("secrets"), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null; // wrong key or tampered ciphertext
  }
}

export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T>(payload: string | null | undefined): T | null {
  const text = decrypt(payload);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ── Signed, expiring tokens for invite and password-reset links ─────────────
type TokenBody = { p: string; sub: string; exp: number; v?: string };

export function signToken(purpose: "invite" | "reset" | "oauth", subject: string, ttlSeconds: number, version?: string): string {
  const body: TokenBody = { p: purpose, sub: subject, exp: Math.floor(Date.now() / 1000) + ttlSeconds, ...(version ? { v: version } : {}) };
  const data = Buffer.from(JSON.stringify(body)).toString("base64url");
  const mac = createHmac("sha256", derive(`token:${purpose}`)).update(data).digest("base64url");
  return `${data}.${mac}`;
}

export function verifyToken(purpose: "invite" | "reset" | "oauth", token: string | null | undefined): { subject: string; version?: string } | null {
  if (!token) return null;
  const [data, mac] = token.split(".");
  if (!data || !mac) return null;
  const expected = createHmac("sha256", derive(`token:${purpose}`)).update(data).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const body = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as TokenBody;
    if (body.p !== purpose || body.exp < Date.now() / 1000) return null;
    return { subject: body.sub, version: body.v };
  } catch {
    return null;
  }
}

/** Shared secret expected on /api/cron/* requests. */
export function cronSecret(): string {
  return serverEnv().cronSecret || derive("cron").toString("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Human-friendly access code without look-alike characters (no 0/O, 1/I/L). */
export function accessCode(length = 8): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) code += alphabet[bytes[i] % alphabet.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
