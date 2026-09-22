import "server-only";

import { decrypt, decryptJson, encrypt, encryptJson } from "@/lib/crypto";
import { recordEvent } from "@/lib/events";
import { PROVIDERS, isProviderId, type ProviderId } from "@/lib/social/catalog";
import { appProviderFor, getProvider } from "@/lib/social/providers";
import { ProviderError } from "@/lib/social/providers/http";
import type { AccountContext, AppCredentials, DiscoveredAccount, TokenSet } from "@/lib/social/providers/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/types/database";

/**
 * Everything that touches network credentials. Secrets are AES-256-GCM
 * encrypted before they reach Postgres, live in tables with no RLS policies
 * (service role only), and are never returned to the browser.
 */

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

// ── Developer apps ──────────────────────────────────────────────────────────
export async function getApp(provider: ProviderId): Promise<AppCredentials | null> {
  const { data } = await createAdminClient().from("social_apps").select("client_id, client_secret_enc, extra").eq("provider", appProviderFor(provider)).maybeSingle();
  const secret = decrypt(data?.client_secret_enc);
  if (!data?.client_id || !secret) return null;
  return { clientId: data.client_id, clientSecret: secret, extra: asRecord(data.extra) };
}

/** Which networks have a developer app saved — IDs and options only, never secrets. */
export async function listApps(): Promise<Partial<Record<ProviderId, { clientId: string; extra: Record<string, unknown> }>>> {
  const { data } = await createAdminClient().from("social_apps").select("provider, client_id, extra");
  const apps: Partial<Record<ProviderId, { clientId: string; extra: Record<string, unknown> }>> = {};
  for (const row of data ?? []) if (isProviderId(row.provider) && row.client_id) apps[row.provider] = { clientId: row.client_id, extra: asRecord(row.extra) };
  return apps;
}

export async function saveApp(provider: ProviderId, clientId: string, clientSecret: string | null, extra: Record<string, unknown>, userId: string): Promise<void> {
  const admin = createAdminClient();
  const values = { provider, client_id: clientId, extra: extra as Json, updated_by: userId, updated_at: new Date().toISOString() };
  // An empty secret on an existing app means "keep the one already saved".
  const { error } = clientSecret
    ? await admin.from("social_apps").upsert({ ...values, client_secret_enc: encrypt(clientSecret) })
    : await admin.from("social_apps").update(values).eq("provider", provider);
  if (error) throw new Error(error.message);
}

// ── Accounts ────────────────────────────────────────────────────────────────
export async function saveDiscovered(accounts: DiscoveredAccount[], userId: string): Promise<{ id: string; name: string; provider: ProviderId }[]> {
  const admin = createAdminClient();
  const saved = [];
  for (const account of accounts) {
    const { data, error } = await admin.from("social_accounts").upsert({
      provider: account.provider, external_id: account.externalId, display_name: account.displayName, username: account.username ?? null,
      avatar_url: account.avatarUrl ?? null, account_type: account.accountType, profile_url: account.profileUrl ?? null, status: "active", status_detail: null,
      scopes: account.tokens.scopes ?? [], token_expires_at: account.tokens.expiresAt ?? null, meta: (account.meta ?? {}) as Json, connected_by: userId,
    }, { onConflict: "provider,external_id" }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Could not save the account.");
    await writeTokens(data.id, account.tokens);
    saved.push({ id: data.id, name: account.displayName, provider: account.provider });
  }
  return saved;
}

async function writeTokens(accountId: string, tokens: TokenSet): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("social_account_secrets").upsert({
    account_id: accountId, access_token_enc: encrypt(tokens.accessToken), refresh_token_enc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    extra_enc: tokens.extra ? encryptJson(tokens.extra) : null, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  await admin.from("social_accounts").update({ token_expires_at: tokens.expiresAt ?? null, status: "active", status_detail: null }).eq("id", accountId);
}

async function markBroken(account: Tables<"social_accounts">, detail: string): Promise<void> {
  const admin = createAdminClient();
  if (account.status !== "active") return; // already flagged: don't alert twice
  await admin.from("social_accounts").update({ status: "expired", status_detail: detail.slice(0, 300) }).eq("id", account.id);
  await recordEvent({
    actor: null, action: "social.account_expired", category: "social", audience: "admins", importance: "high", tone: "critical",
    summary: `${PROVIDERS[account.provider as ProviderId]?.name ?? account.provider} channel “${account.display_name}” needs reconnecting`,
    detail, entity: { type: "social_account", id: account.id, label: account.display_name }, link: "/social/accounts",
  });
}

/**
 * Decrypts an account's login and, when it is about to lapse, renews it first
 * (X tokens last two hours, TikTok's a day — nobody should have to think about that).
 */
export async function loadContext(account: Tables<"social_accounts">): Promise<{ context: AccountContext; app: AppCredentials | null }> {
  if (!isProviderId(account.provider)) throw new ProviderError("This channel's network is no longer supported.");
  const provider = account.provider;
  const base = { id: account.id, provider, externalId: account.external_id, username: account.username, profileUrl: account.profile_url, meta: asRecord(account.meta) };
  if (PROVIDERS[provider].auth === "none") return { context: { ...base, tokens: { accessToken: "" } }, app: null };

  const admin = createAdminClient();
  const { data: secrets } = await admin.from("social_account_secrets").select("access_token_enc, refresh_token_enc, extra_enc").eq("account_id", account.id).maybeSingle();
  const accessToken = decrypt(secrets?.access_token_enc);
  if (!accessToken) {
    await markBroken(account, "The saved login could not be read. Reconnect the channel.");
    throw new ProviderError("This channel's login is missing. Reconnect it under Channels.", undefined, true);
  }
  let tokens: TokenSet = { accessToken, refreshToken: decrypt(secrets?.refresh_token_enc), expiresAt: account.token_expires_at, extra: decryptJson<Record<string, unknown>>(secrets?.extra_enc) ?? undefined };
  const app = PROVIDERS[provider].auth === "oauth" ? await getApp(provider) : null;

  const lapsesSoon = tokens.expiresAt !== null && tokens.expiresAt !== undefined && Date.parse(tokens.expiresAt) - Date.now() < 10 * 60_000;
  if (lapsesSoon) {
    const adapter = getProvider(appProviderFor(provider)).oauth;
    let renewed: TokenSet | null = null;
    try {
      renewed = adapter?.refresh && app ? await adapter.refresh(app, tokens) : null;
    } catch (err) {
      await markBroken(account, `Renewing the login failed: ${err instanceof Error ? err.message : "unknown error"}`);
      throw new ProviderError("This channel's login has expired and could not be renewed. Reconnect it under Channels.", undefined, true);
    }
    if (renewed?.accessToken) {
      tokens = { ...tokens, ...renewed };
      await writeTokens(account.id, tokens);
    } else if (Date.parse(tokens.expiresAt!) <= Date.now()) {
      await markBroken(account, "The login has expired. Reconnect the channel.");
      throw new ProviderError("This channel's login has expired. Reconnect it under Channels.", undefined, true);
    }
  }
  return { context: { ...base, tokens }, app };
}

/**
 * Daily care for long-lived logins: renew the ones that can be renewed (Threads),
 * and warn admins a week ahead about the ones that can't (LinkedIn's 60-day login).
 */
export async function tendAccounts(): Promise<{ renewed: number; warned: number }> {
  const admin = createAdminClient();
  const horizon = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { data } = await admin.from("social_accounts").select("*").eq("status", "active").in("provider", ["linkedin", "threads", "instagram"]).not("token_expires_at", "is", null).lt("token_expires_at", horizon);
  let renewed = 0, warned = 0;

  for (const account of data ?? []) {
    const provider = account.provider as ProviderId;
    const meta = asRecord(account.meta);
    try {
      const { data: secrets } = await admin.from("social_account_secrets").select("access_token_enc, refresh_token_enc, extra_enc").eq("account_id", account.id).maybeSingle();
      const accessToken = decrypt(secrets?.access_token_enc);
      const app = await getApp(provider);
      const adapter = getProvider(provider).oauth;
      if (!accessToken || !app || !adapter?.refresh) continue;
      const tokens: TokenSet = { accessToken, refreshToken: decrypt(secrets?.refresh_token_enc), expiresAt: account.token_expires_at, extra: decryptJson<Record<string, unknown>>(secrets?.extra_enc) ?? undefined };
      const next = await adapter.refresh(app, tokens);
      if (next?.accessToken) { await writeTokens(account.id, { ...tokens, ...next }); renewed++; continue; }
    } catch (err) {
      console.warn(`[social] could not renew ${account.provider} login:`, err instanceof Error ? err.message : err);
    }
    // Can't be renewed automatically: tell the admins once.
    if (meta.expiry_warned_for === account.token_expires_at) continue;
    const days = Math.max(0, Math.ceil((Date.parse(account.token_expires_at!) - Date.now()) / 86_400_000));
    await recordEvent({
      actor: null, action: "social.account_expiring", category: "social", audience: "admins", importance: "high", tone: "warning",
      summary: `${PROVIDERS[provider].name} channel “${account.display_name}” must be reconnected within ${days} day${days === 1 ? "" : "s"}`,
      detail: `${PROVIDERS[provider].name} logins last 60 days and can't be renewed automatically. Open Channels and press Reconnect — it takes ten seconds.`,
      entity: { type: "social_account", id: account.id, label: account.display_name }, link: "/social/accounts",
    });
    await admin.from("social_accounts").update({ meta: { ...meta, expiry_warned_for: account.token_expires_at } as Json }).eq("id", account.id);
    warned++;
  }
  return { renewed, warned };
}
