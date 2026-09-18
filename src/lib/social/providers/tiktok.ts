import "server-only";

import { api, download, expiresIn, obj, ProviderError, str } from "@/lib/social/providers/http";
import { isVideo, type Provider, type PublishOutcome, type TokenSet } from "@/lib/social/providers/types";

const API = "https://open.tiktokapis.com/v2";
const SCOPES = ["user.info.basic", "video.upload", "video.publish"];
const MB = 1024 * 1024;

function tokensFrom(data: Record<string, unknown>, previous?: TokenSet): TokenSet {
  if (str(data.error)) throw new ProviderError(str(data.error_description) || str(data.error));
  return {
    accessToken: str(data.access_token),
    refreshToken: str(data.refresh_token) || previous?.refreshToken || null,
    expiresAt: expiresIn(data.expires_in), // 24 hours — refreshed automatically
    scopes: str(data.scope).split(",").filter(Boolean),
    extra: { open_id: str(data.open_id) || previous?.extra?.open_id },
  };
}

/** TikTok reports failures inside a 200 response. */
function unwrap(data: Record<string, unknown>): Record<string, unknown> {
  const error = obj(data.error);
  const code = str(error.code);
  if (code && code !== "ok") {
    const hint: Record<string, string> = {
      unaudited_client_can_only_post_to_private_accounts: "TikTok hasn't audited this app yet, so direct posts only work on private accounts. Use “Send to TikTok inbox” instead.",
      spam_risk_too_many_posts: "TikTok's daily posting limit for this account has been reached.",
      scope_not_authorized: "This TikTok login didn't grant posting permission. Reconnect the account and accept every permission.",
      access_token_invalid: "The TikTok login has expired. Reconnect the account.",
    };
    throw new ProviderError(hint[code] ?? (str(error.message) || code), undefined, code === "access_token_invalid");
  }
  return obj(data.data);
}

/**
 * TikTok's rule: chunks of 5–64 MB, `total_chunk_count = floor(size / chunk_size)`,
 * and the last chunk absorbs the remainder (so it may be up to 2× chunk_size).
 * Files under 5 MB go up whole.
 */
function plan(size: number): { chunkSize: number; count: number } {
  if (size <= 20 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 10 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

async function status(token: string, publishId: string): Promise<PublishOutcome> {
  const data = unwrap((await api(`${API}/post/publish/status/fetch/`, { bearer: token, json: { publish_id: publishId } })).data);
  const state = str(data.status);
  if (state === "FAILED") throw new ProviderError(`TikTok could not process the video${str(data.fail_reason) ? ` (${str(data.fail_reason).replace(/_/g, " ")})` : ""}.`);
  if (state === "PUBLISH_COMPLETE") {
    const postId = str((Array.isArray(data.publicaly_available_post_id) ? data.publicaly_available_post_id[0] : "") ?? "");
    return { status: "published", externalId: postId || publishId, url: null };
  }
  // Delivered to the creator's inbox: our part is done, they finish the post in the TikTok app.
  if (state === "SEND_TO_USER_INBOX") return { status: "published", externalId: publishId, url: null };
  return { status: "pending", state: { publishId }, note: "TikTok is processing the video." };
}

export const tiktok: Provider = {
  id: "tiktok",

  oauth: {
    scopes: () => SCOPES,

    authUrl: (app, redirectUri, state) =>
      `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({ client_key: app.clientId, response_type: "code", scope: SCOPES.join(","), redirect_uri: redirectUri, state })}`,

    async exchange(app, redirectUri, code) {
      const { data } = await api(`${API}/oauth/token/`, { form: { client_key: app.clientId, client_secret: app.clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri } });
      return tokensFrom(data);
    },

    async refresh(app, tokens) {
      if (!tokens.refreshToken) return null;
      const { data } = await api(`${API}/oauth/token/`, { form: { client_key: app.clientId, client_secret: app.clientSecret, grant_type: "refresh_token", refresh_token: tokens.refreshToken } });
      return tokensFrom(data, tokens);
    },

    async discover(_app, tokens) {
      const user = obj(unwrap((await api(`${API}/user/info/?fields=open_id,avatar_url,display_name`, { bearer: tokens.accessToken })).data).user);
      const openId = str(user.open_id) || str(tokens.extra?.open_id);
      return [{ provider: "tiktok", externalId: openId, displayName: str(user.display_name) || "TikTok account", avatarUrl: str(user.avatar_url) || null, accountType: "account", tokens }];
    },
  },

  async publish(account, input) {
    const token = account.tokens.accessToken;
    if (input.pending?.publishId) return status(token, str(input.pending.publishId));

    const video = input.media.find(isVideo);
    if (!video) throw new ProviderError("TikTok needs a video.");
    const size = video.sizeBytes;
    const { chunkSize, count } = plan(size);
    const source = { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: count };
    const direct = input.options.tiktok_mode === "direct";

    let init: Record<string, unknown>;
    if (direct) {
      // Direct posts must use a privacy level the creator currently allows.
      const creator = unwrap((await api(`${API}/post/publish/creator_info/query/`, { bearer: token, json: {} })).data);
      const allowed = Array.isArray(creator.privacy_level_options) ? (creator.privacy_level_options as unknown[]).map(str) : [];
      const wanted = str(input.options.tiktok_privacy) || "PUBLIC_TO_EVERYONE";
      const privacy = allowed.includes(wanted) ? wanted : (allowed[0] ?? "SELF_ONLY");
      init = unwrap((await api(`${API}/post/publish/video/init/`, {
        bearer: token,
        json: { post_info: { title: [input.text, input.link].filter(Boolean).join(" ").slice(0, 2200), privacy_level: privacy, disable_duet: false, disable_comment: false, disable_stitch: false }, source_info: source },
      })).data);
    } else {
      init = unwrap((await api(`${API}/post/publish/inbox/video/init/`, { bearer: token, json: { source_info: source } })).data);
    }

    const publishId = str(init.publish_id);
    const uploadUrl = str(init.upload_url);
    if (!publishId || !uploadUrl) throw new ProviderError("TikTok did not open an upload for this video.");

    for (let index = 0; index < count; index++) {
      const start = index * chunkSize;
      const end = index === count - 1 ? size - 1 : start + chunkSize - 1;
      const chunk = await download(video.url, { start, end });
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": video.mimeType || "video/mp4", "Content-Length": String(chunk.length), "Content-Range": `bytes ${start}-${end}/${size}` },
        body: new Uint8Array(chunk),
        signal: AbortSignal.timeout(180_000),
      }).catch(() => null);
      if (!res || (res.status !== 201 && res.status !== 206)) throw new ProviderError(`TikTok rejected the video upload${res ? ` (${res.status})` : ""}.`);
    }
    return status(token, publishId);
  },
};
