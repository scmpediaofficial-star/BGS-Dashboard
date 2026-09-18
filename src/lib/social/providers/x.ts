import "server-only";

import { api, download, expiresIn, obj, ProviderError, str } from "@/lib/social/providers/http";
import { isVideo, type AppCredentials, type Provider, type PublishMedia, type TokenSet } from "@/lib/social/providers/types";

const API = "https://api.x.com/2";
const SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];
const CHUNK = 4 * 1024 * 1024; // X accepts up to 5 MB per APPEND

const basic = (app: AppCredentials) => ({ Authorization: `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64")}` });

function tokensFrom(data: Record<string, unknown>, previous?: TokenSet): TokenSet {
  return {
    accessToken: str(data.access_token),
    // X rotates refresh tokens: each one works once, so the newest must always be stored.
    refreshToken: str(data.refresh_token) || previous?.refreshToken || null,
    expiresAt: expiresIn(data.expires_in),
    scopes: str(data.scope).split(" ").filter(Boolean),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Chunked v2 upload: initialize → append (≤5 MB each) → finalize → wait for processing. */
async function upload(token: string, media: PublishMedia): Promise<string> {
  const video = isVideo(media);
  const source = video ? media.url : (media.jpegUrl ?? media.url);
  const bytes = await download(source);
  const mediaType = video ? media.mimeType : source === media.jpegUrl ? "image/jpeg" : media.mimeType;
  const category = video ? "tweet_video" : media.mimeType === "image/gif" ? "tweet_gif" : "tweet_image";

  const init = await api(`${API}/media/upload/initialize`, { bearer: token, json: { media_type: mediaType, total_bytes: bytes.length, media_category: category } });
  const id = str(obj(init.data.data).id);
  if (!id) throw new ProviderError("X did not accept the media upload.");

  for (let offset = 0, index = 0; offset < bytes.length; offset += CHUNK, index++) {
    const form = new FormData();
    form.set("segment_index", String(index));
    form.set("media", new Blob([new Uint8Array(bytes.subarray(offset, offset + CHUNK))], { type: mediaType }), media.fileName);
    await api(`${API}/media/upload/${id}/append`, { method: "POST", bearer: token, body: form, timeoutMs: 120_000 });
  }

  let info = obj(obj((await api(`${API}/media/upload/${id}/finalize`, { method: "POST", bearer: token })).data.data).processing_info);
  for (let attempt = 0; attempt < 20 && ["pending", "in_progress"].includes(str(info.state)); attempt++) {
    await sleep(Math.min(Number(info.check_after_secs) || 2, 5) * 1000);
    info = obj(obj((await api(`${API}/media/upload?${new URLSearchParams({ command: "STATUS", media_id: id })}`, { bearer: token })).data.data).processing_info);
  }
  if (str(info.state) === "failed") throw new ProviderError("X could not process this media file.");
  if (["pending", "in_progress"].includes(str(info.state))) throw new ProviderError("X is still processing the video. Try publishing again in a minute.");

  if (media.altText && !video) {
    try { await api(`${API}/media/metadata`, { bearer: token, json: { id, metadata: { alt_text: { text: media.altText.slice(0, 1000) } } } }); } catch { /* alt text is best-effort */ }
  }
  return id;
}

export const x: Provider = {
  id: "x",

  oauth: {
    pkce: true,
    scopes: () => SCOPES,

    authUrl: (app, redirectUri, state, codeChallenge) =>
      `https://x.com/i/oauth2/authorize?${new URLSearchParams({ response_type: "code", client_id: app.clientId, redirect_uri: redirectUri, scope: SCOPES.join(" "), state, code_challenge: codeChallenge, code_challenge_method: "S256" })}`,

    async exchange(app, redirectUri, code, codeVerifier) {
      const { data } = await api(`${API}/oauth2/token`, { headers: basic(app), form: { grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: codeVerifier, client_id: app.clientId } });
      return tokensFrom(data);
    },

    async refresh(app, tokens) {
      if (!tokens.refreshToken) return null;
      const { data } = await api(`${API}/oauth2/token`, { headers: basic(app), form: { grant_type: "refresh_token", refresh_token: tokens.refreshToken, client_id: app.clientId } });
      return tokensFrom(data, tokens);
    },

    async discover(_app, tokens) {
      const me = obj((await api(`${API}/users/me?user.fields=profile_image_url,username,name`, { bearer: tokens.accessToken })).data.data);
      const username = str(me.username);
      return [{
        provider: "x", externalId: str(me.id), displayName: str(me.name) || `@${username}`, username: username || null,
        avatarUrl: str(me.profile_image_url).replace("_normal", "_200x200") || null, accountType: "account", profileUrl: username ? `https://x.com/${username}` : null, tokens,
      }];
    },
  },

  async publish(account, input) {
    const token = account.tokens.accessToken;
    const mediaIds: string[] = [];
    for (const media of input.media.slice(0, 4)) mediaIds.push(await upload(token, media));

    const text = [input.text, input.link].filter(Boolean).join("\n\n");
    const res = await api(`${API}/tweets`, { bearer: token, json: { text, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) } });
    const id = str(obj(res.data.data).id);
    if (!id) throw new ProviderError("X accepted the post but returned no post ID.");
    return { status: "published", externalId: id, url: `https://x.com/${account.username ?? "i"}/status/${id}` };
  },
};
