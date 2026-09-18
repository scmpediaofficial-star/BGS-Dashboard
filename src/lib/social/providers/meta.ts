import "server-only";

import { api, expiresIn, list, obj, ProviderError, str } from "@/lib/social/providers/http";
import { isImage, isVideo, type AccountContext, type AppCredentials, type DiscoveredAccount, type Provider, type PublishInput, type PublishOutcome } from "@/lib/social/providers/types";

/**
 * Unversioned Graph calls resolve to the oldest version still available to the
 * app, so nothing here breaks when Meta retires a version. (Override: app extra `api_version`, e.g. "v25.0".)
 */
function graph(app: AppCredentials | null): string {
  const pinned = str(app?.extra.api_version);
  return `https://graph.facebook.com${/^v\d+\.\d+$/.test(pinned) ? `/${pinned}` : ""}`;
}

const SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management", "instagram_basic", "instagram_content_publish"];

export const facebook: Provider = {
  id: "facebook",

  oauth: {
    scopes: () => SCOPES,

    authUrl: (app, redirectUri, state) =>
      `https://www.facebook.com/dialog/oauth?${new URLSearchParams({ client_id: app.clientId, redirect_uri: redirectUri, state, response_type: "code", scope: SCOPES.join(",") })}`,

    async exchange(app, redirectUri, code) {
      const base = graph(app);
      const short = await api(`${base}/oauth/access_token?${new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: redirectUri, code })}`);
      // Swap for a 60-day user token: Page tokens derived from it do not expire.
      const long = await api(`${base}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: app.clientId, client_secret: app.clientSecret, fb_exchange_token: str(short.data.access_token) })}`);
      return { accessToken: str(long.data.access_token), expiresAt: expiresIn(long.data.expires_in) };
    },

    /** One Meta login yields every Page the person manages — and each Page's linked Instagram account. */
    async discover(app, tokens) {
      const fields = "id,name,username,link,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}";
      const pages = await api(`${graph(app)}/me/accounts?${new URLSearchParams({ fields, limit: "100" })}`, { bearer: tokens.accessToken });
      const accounts: DiscoveredAccount[] = [];
      for (const page of list(pages.data.data)) {
        const pageToken = str(page.access_token);
        if (!pageToken) continue;
        const pageTokens = { accessToken: pageToken, expiresAt: null };
        accounts.push({
          provider: "facebook", externalId: str(page.id), displayName: str(page.name), username: str(page.username) || null,
          avatarUrl: str(obj(obj(page.picture).data).url) || null, accountType: "page", profileUrl: str(page.link) || `https://www.facebook.com/${str(page.id)}`, tokens: pageTokens,
        });
        const ig = obj(page.instagram_business_account);
        if (str(ig.id)) {
          accounts.push({
            provider: "instagram", externalId: str(ig.id), displayName: str(ig.name) || `@${str(ig.username)}`, username: str(ig.username) || null,
            avatarUrl: str(ig.profile_picture_url) || null, accountType: "professional", profileUrl: str(ig.username) ? `https://www.instagram.com/${str(ig.username)}/` : null,
            tokens: pageTokens, meta: { page_id: str(page.id) },
          });
        }
      }
      if (!accounts.length) throw new ProviderError("That Facebook login doesn't manage any Pages. Sign in as a Page admin and tick the Pages to share.");
      return accounts;
    },
  },

  async publish(account: AccountContext, input: PublishInput, app) {
    const base = `${graph(app)}/${account.externalId}`;
    const token = account.tokens.accessToken;
    const images = input.media.filter(isImage);
    const video = input.media.find(isVideo);
    const message = input.text;

    if (video) {
      const res = await api(`${base}/videos`, { bearer: token, form: { file_url: video.url, description: [message, input.link].filter(Boolean).join("\n\n") }, timeoutMs: 120_000 });
      const id = str(res.data.id);
      return { status: "published", externalId: id, url: `https://www.facebook.com/${account.externalId}/videos/${id}` };
    }
    if (images.length === 1) {
      const res = await api(`${base}/photos`, { bearer: token, form: { url: images[0].url, message: [message, input.link].filter(Boolean).join("\n\n"), alt_text_custom: images[0].altText ?? undefined } });
      const id = str(res.data.post_id) || str(res.data.id);
      return { status: "published", externalId: id, url: `https://www.facebook.com/${id}` };
    }
    if (images.length > 1) {
      const form: Record<string, string> = { message: [message, input.link].filter(Boolean).join("\n\n") };
      for (const [index, image] of images.entries()) {
        const photo = await api(`${base}/photos`, { bearer: token, form: { url: image.url, published: "false", alt_text_custom: image.altText ?? undefined } });
        form[`attached_media[${index}]`] = JSON.stringify({ media_fbid: str(photo.data.id) });
      }
      const res = await api(`${base}/feed`, { bearer: token, form });
      return { status: "published", externalId: str(res.data.id), url: `https://www.facebook.com/${str(res.data.id)}` };
    }
    const res = await api(`${base}/feed`, { bearer: token, form: { message, link: input.link ?? undefined } });
    return { status: "published", externalId: str(res.data.id), url: `https://www.facebook.com/${str(res.data.id)}` };
  },
};

// ── Instagram (professional account linked to a Page; connects through the Facebook login) ──
async function finishInstagram(base: string, token: string, containerId: string): Promise<PublishOutcome> {
  const state = await api(`${base.replace(/\/[^/]+$/, "")}/${containerId}?fields=status_code,status`, { bearer: token });
  const code = str(state.data.status_code);
  if (code === "ERROR" || code === "EXPIRED") throw new ProviderError(`Instagram could not process this media${str(state.data.status) ? `: ${str(state.data.status)}` : "."}`);
  if (code !== "FINISHED") return { status: "pending", state: { containerId }, note: "Instagram is processing the media." };

  const published = await api(`${base}/media_publish`, { bearer: token, form: { creation_id: containerId } });
  const id = str(published.data.id);
  let url: string | null = null;
  try { url = str((await api(`${base.replace(/\/[^/]+$/, "")}/${id}?fields=permalink`, { bearer: token })).data.permalink) || null; } catch { /* the post is live; the link is a nicety */ }
  return { status: "published", externalId: id, url };
}

export const instagram: Provider = {
  id: "instagram",

  async publish(account: AccountContext, input: PublishInput, app) {
    const base = `${graph(app)}/${account.externalId}`;
    const token = account.tokens.accessToken;
    if (input.pending?.containerId) return finishInstagram(base, token, str(input.pending.containerId));

    const caption = [input.text, input.link].filter(Boolean).join("\n\n");
    const media = input.media;
    if (!media.length) throw new ProviderError("Instagram needs an image or a video.");
    // Instagram only ingests JPEG stills.
    const still = (m: (typeof media)[number]) => m.jpegUrl ?? m.url;

    let containerId: string;
    if (media.length === 1) {
      const m = media[0];
      const form = isVideo(m)
        ? { media_type: "REELS", video_url: m.url, caption, share_to_feed: "true" }
        : { image_url: still(m), caption, alt_text: m.altText ?? undefined };
      containerId = str((await api(`${base}/media`, { bearer: token, form })).data.id);
    } else {
      const children: string[] = [];
      for (const m of media.slice(0, 10)) {
        const form = isVideo(m) ? { media_type: "VIDEO", video_url: m.url, is_carousel_item: "true" } : { image_url: still(m), is_carousel_item: "true" };
        children.push(str((await api(`${base}/media`, { bearer: token, form })).data.id));
      }
      containerId = str((await api(`${base}/media`, { bearer: token, form: { media_type: "CAROUSEL", children: children.join(","), caption } })).data.id);
    }
    if (!containerId) throw new ProviderError("Instagram did not accept the media.");
    return finishInstagram(base, token, containerId);
  },
};
