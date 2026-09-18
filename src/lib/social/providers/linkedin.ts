import "server-only";

import { api, download, expiresIn, list, obj, ProviderError, str } from "@/lib/social/providers/http";
import { isImage, isVideo, type AccountContext, type AppCredentials, type DiscoveredAccount, type Provider, type PublishInput, type TokenSet } from "@/lib/social/providers/types";

const REST = "https://api.linkedin.com/rest";

/**
 * LinkedIn retires each monthly API version after about a year. Asking for the
 * version from two months ago is always a released, supported one — so this
 * keeps working without anyone editing a constant. (Override: app extra `api_version`.)
 */
function version(app: AppCredentials | null): string {
  const pinned = str(app?.extra.api_version);
  if (/^\d{6}$/.test(pinned)) return pinned;
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 2);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const headers = (app: AppCredentials | null) => ({ "LinkedIn-Version": version(app), "X-Restli-Protocol-Version": "2.0.0" });

/**
 * `commentary` is LinkedIn's "little text" format: these characters are syntax,
 * and an unescaped "(" silently truncates the post. "#" is left alone so
 * hashtags still link.
 */
export function escapeCommentary(text: string): string {
  return text.replace(/[\\|{}@[\]()<>*_~]/g, (c) => `\\${c}`);
}

function tokensFrom(data: Record<string, unknown>): TokenSet {
  return {
    accessToken: str(data.access_token),
    refreshToken: str(data.refresh_token) || null,
    expiresAt: expiresIn(data.expires_in),
    scopes: str(data.scope).split(/[ ,]+/).filter(Boolean),
  };
}

async function uploadImage(owner: string, token: string, app: AppCredentials | null, url: string): Promise<string> {
  const init = await api(`${REST}/images?action=initializeUpload`, { bearer: token, headers: headers(app), json: { initializeUploadRequest: { owner } } });
  const value = obj(init.data.value);
  const uploadUrl = str(value.uploadUrl);
  const image = str(value.image);
  if (!uploadUrl || !image) throw new ProviderError("LinkedIn did not accept the image upload.");
  await api(uploadUrl, { method: "PUT", bearer: token, headers: { "Content-Type": "application/octet-stream" }, body: new Uint8Array(await download(url)), timeoutMs: 120_000 });
  return image;
}

async function uploadVideo(owner: string, token: string, app: AppCredentials | null, url: string, size: number): Promise<string> {
  const init = await api(`${REST}/videos?action=initializeUpload`, {
    bearer: token, headers: headers(app),
    json: { initializeUploadRequest: { owner, fileSizeBytes: size, uploadCaptions: false, uploadThumbnail: false } },
  });
  const value = obj(init.data.value);
  const video = str(value.video);
  const parts = list(value.uploadInstructions);
  if (!video || !parts.length) throw new ProviderError("LinkedIn did not accept the video upload.");

  const etags: string[] = [];
  for (const part of parts) {
    const chunk = await download(url, { start: Number(part.firstByte), end: Number(part.lastByte) });
    const res = await api(str(part.uploadUrl), { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: new Uint8Array(chunk), timeoutMs: 180_000 });
    etags.push((res.headers.get("etag") ?? "").replace(/"/g, ""));
  }
  await api(`${REST}/videos?action=finalizeUpload`, { bearer: token, headers: headers(app), json: { finalizeUploadRequest: { video, uploadToken: str(value.uploadToken), uploadedPartIds: etags } } });
  return video;
}

export const linkedin: Provider = {
  id: "linkedin",

  oauth: {
    scopes: (app) => ["openid", "profile", "email", "w_member_social", ...(app.extra.pages ? ["w_organization_social", "r_organization_social", "rw_organization_admin"] : [])],

    authUrl: (app, redirectUri, state) =>
      `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({ response_type: "code", client_id: app.clientId, redirect_uri: redirectUri, state, scope: linkedin.oauth!.scopes(app).join(" ") })}`,

    async exchange(app, redirectUri, code) {
      const { data } = await api("https://www.linkedin.com/oauth/v2/accessToken", { form: { grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: app.clientId, client_secret: app.clientSecret } });
      return tokensFrom(data);
    },

    async refresh(app, tokens) {
      if (!tokens.refreshToken) return null; // LinkedIn only issues refresh tokens to some apps: otherwise reconnect every 60 days
      const { data } = await api("https://www.linkedin.com/oauth/v2/accessToken", { form: { grant_type: "refresh_token", refresh_token: tokens.refreshToken, client_id: app.clientId, client_secret: app.clientSecret } });
      const next = tokensFrom(data);
      return { ...next, refreshToken: next.refreshToken ?? tokens.refreshToken };
    },

    async discover(app, tokens) {
      const me = (await api("https://api.linkedin.com/v2/userinfo", { bearer: tokens.accessToken })).data;
      const accounts: DiscoveredAccount[] = [{
        provider: "linkedin", externalId: `urn:li:person:${str(me.sub)}`, displayName: str(me.name) || "LinkedIn profile",
        avatarUrl: str(me.picture) || null, accountType: "profile", profileUrl: "https://www.linkedin.com/feed/", tokens,
      }];

      if (app.extra.pages) {
        try {
          const acls = await api(`${REST}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=50`, { bearer: tokens.accessToken, headers: headers(app) });
          for (const acl of list(acls.data.elements)) {
            const urn = str(acl.organization);
            const id = urn.split(":").pop() ?? "";
            if (!id) continue;
            const org = (await api(`${REST}/organizations/${id}`, { bearer: tokens.accessToken, headers: headers(app) })).data;
            const vanity = str(org.vanityName);
            accounts.push({
              provider: "linkedin", externalId: urn, displayName: str(org.localizedName) || `Company page ${id}`, username: vanity || null,
              accountType: "page", profileUrl: vanity ? `https://www.linkedin.com/company/${vanity}/` : null, tokens,
            });
          }
        } catch (err) {
          // Page access not granted yet: the personal profile still connects.
          console.warn("[linkedin] could not list company pages:", err instanceof Error ? err.message : err);
        }
      }
      return accounts;
    },
  },

  async publish(account: AccountContext, input: PublishInput, app) {
    const token = account.tokens.accessToken;
    const author = account.externalId;
    const images = input.media.filter(isImage);
    const video = input.media.find(isVideo);

    let content: Record<string, unknown> | undefined;
    let text = input.text;
    if (video) {
      content = { media: { id: await uploadVideo(author, token, app, video.url, video.sizeBytes), title: str(input.options.title) || text.split("\n")[0].slice(0, 100) || "Video" } };
    } else if (images.length === 1) {
      content = { media: { id: await uploadImage(author, token, app, images[0].jpegUrl ?? images[0].url), altText: images[0].altText ?? "" } };
    } else if (images.length > 1) {
      const uploaded = [];
      for (const image of images) uploaded.push({ id: await uploadImage(author, token, app, image.jpegUrl ?? image.url), altText: image.altText ?? "" });
      content = { multiImage: { images: uploaded } };
    } else if (input.link) {
      // LinkedIn does not scrape links posted through the API: the card's title has to be supplied.
      let host = input.link;
      try { host = new URL(input.link).hostname.replace(/^www\./, ""); } catch { /* keep as typed */ }
      content = { article: { source: input.link, title: str(input.options.link_title) || text.split("\n")[0].slice(0, 120) || host, description: host } };
    }
    // With media attached there is no link card, so the link travels in the text.
    if (input.link && !content?.article) text = [text, input.link].filter(Boolean).join("\n\n");

    const res = await api(`${REST}/posts`, {
      bearer: token, headers: headers(app),
      json: {
        author, commentary: escapeCommentary(text), visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        ...(content ? { content } : {}), lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
      },
    });
    const urn = res.headers.get("x-restli-id") ?? "";
    if (!urn) throw new ProviderError("LinkedIn accepted the post but returned no post ID.");
    return { status: "published", externalId: urn, url: `https://www.linkedin.com/feed/update/${urn}/` };
  },
};
