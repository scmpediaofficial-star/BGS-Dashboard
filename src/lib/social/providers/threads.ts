import "server-only";

import { api, expiresIn, ProviderError, str } from "@/lib/social/providers/http";
import { isVideo, type Provider, type PublishOutcome } from "@/lib/social/providers/types";

const API = "https://graph.threads.net";
const SCOPES = ["threads_basic", "threads_content_publish"];

async function finish(userId: string, token: string, containerId: string): Promise<PublishOutcome> {
  const state = await api(`${API}/v1.0/${containerId}?fields=status,error_message`, { bearer: token });
  const status = str(state.data.status);
  if (status === "ERROR" || status === "EXPIRED") throw new ProviderError(`Threads could not process this post${str(state.data.error_message) ? `: ${str(state.data.error_message)}` : "."}`);
  if (status && status !== "FINISHED") return { status: "pending", state: { containerId }, note: "Threads is processing the media." };

  const published = await api(`${API}/v1.0/${userId}/threads_publish`, { bearer: token, form: { creation_id: containerId } });
  const id = str(published.data.id);
  let url: string | null = null;
  try { url = str((await api(`${API}/v1.0/${id}?fields=permalink`, { bearer: token })).data.permalink) || null; } catch { /* live either way */ }
  return { status: "published", externalId: id, url };
}

export const threads: Provider = {
  id: "threads",

  oauth: {
    scopes: () => SCOPES,

    authUrl: (app, redirectUri, state) =>
      `https://threads.net/oauth/authorize?${new URLSearchParams({ client_id: app.clientId, redirect_uri: redirectUri, scope: SCOPES.join(","), response_type: "code", state })}`,

    async exchange(app, redirectUri, code) {
      const short = await api(`${API}/oauth/access_token`, { form: { client_id: app.clientId, client_secret: app.clientSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code } });
      const long = await api(`${API}/access_token?${new URLSearchParams({ grant_type: "th_exchange_token", client_secret: app.clientSecret, access_token: str(short.data.access_token) })}`);
      return { accessToken: str(long.data.access_token), expiresAt: expiresIn(long.data.expires_in), extra: { user_id: str(short.data.user_id) } };
    },

    /** Threads has no refresh token: the long-lived token itself is renewed (any time after its first day). */
    async refresh(_app, tokens) {
      const { data } = await api(`${API}/refresh_access_token?${new URLSearchParams({ grant_type: "th_refresh_token", access_token: tokens.accessToken })}`);
      return { ...tokens, accessToken: str(data.access_token), expiresAt: expiresIn(data.expires_in) };
    },

    async discover(_app, tokens) {
      const { data } = await api(`${API}/v1.0/me?fields=id,username,name,threads_profile_picture_url`, { bearer: tokens.accessToken });
      const username = str(data.username);
      return [{
        provider: "threads", externalId: str(data.id), displayName: str(data.name) || `@${username}`, username: username || null,
        avatarUrl: str(data.threads_profile_picture_url) || null, accountType: "profile", profileUrl: username ? `https://www.threads.net/@${username}` : null, tokens,
      }];
    },
  },

  async publish(account, input) {
    const token = account.tokens.accessToken;
    const userId = account.externalId;
    if (input.pending?.containerId) return finish(userId, token, str(input.pending.containerId));

    const base = `${API}/v1.0/${userId}/threads`;
    const media = input.media.slice(0, 10);
    let containerId: string;

    if (!media.length) {
      containerId = str((await api(base, { bearer: token, form: { media_type: "TEXT", text: input.text, link_attachment: input.link ?? undefined } })).data.id);
    } else {
      const text = [input.text, input.link].filter(Boolean).join("\n\n");
      const item = (m: (typeof media)[number], extra: Record<string, string>) =>
        isVideo(m) ? { media_type: "VIDEO", video_url: m.url, ...extra } : { media_type: "IMAGE", image_url: m.jpegUrl ?? m.url, alt_text: m.altText ?? undefined, ...extra };
      if (media.length === 1) {
        containerId = str((await api(base, { bearer: token, form: item(media[0], { text }) })).data.id);
      } else {
        const children: string[] = [];
        for (const m of media) children.push(str((await api(base, { bearer: token, form: item(m, { is_carousel_item: "true" }) })).data.id));
        containerId = str((await api(base, { bearer: token, form: { media_type: "CAROUSEL", children: children.join(","), text } })).data.id);
      }
    }
    if (!containerId) throw new ProviderError("Threads did not accept the post.");
    return finish(userId, token, containerId);
  },
};
