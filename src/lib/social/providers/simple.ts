import "server-only";

import { api, download, list, normaliseUrl, obj, ProviderError, str } from "@/lib/social/providers/http";
import { isImage, isVideo, type Provider, type PublishMedia } from "@/lib/social/providers/types";

/** Networks that connect with a pasted token or app password — no developer app, no OAuth. */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── WordPress (REST API + Application Passwords) ────────────────────────────
const wpAuth = (username: string, password: string) => ({ Authorization: `Basic ${Buffer.from(`${username}:${password.replace(/\s+/g, " ").trim()}`).toString("base64")}` });

/** Plain text → tidy post HTML: blank lines become paragraphs, single newlines become breaks, links become anchors. */
function toHtml(text: string): string {
  return text.trim().split(/\n{2,}/).map((block) => {
    const html = esc(block).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br>");
    return `<p>${html}</p>`;
  }).join("\n");
}

export const wordpress: Provider = {
  id: "wordpress",

  async connect(fields) {
    const site = normaliseUrl(fields.site ?? "");
    const username = (fields.username ?? "").trim();
    const password = fields.password ?? "";
    if (!username || !password) throw new ProviderError("Enter the WordPress username and its application password.");

    let me;
    try {
      me = await api(`${site}/wp-json/wp/v2/users/me?context=edit`, { headers: wpAuth(username, password) });
    } catch (err) {
      const status = err instanceof ProviderError ? err.status : undefined;
      if (status === 401 || status === 403) throw new ProviderError("WordPress rejected that username and application password. Create a new application password under Users → Profile and paste it exactly.");
      if (status === 404) throw new ProviderError("That site doesn't expose the WordPress REST API at /wp-json. Check the address, or whether a security plugin is blocking it.");
      throw err;
    }
    const caps = obj(me.data.capabilities);
    if (!caps.publish_posts && !caps.edit_posts) throw new ProviderError("That WordPress user can't write posts. Use an Author, Editor or Administrator account.");

    const host = new URL(site).hostname.replace(/^www\./, "");
    return [{
      provider: "wordpress", externalId: `${host}:${str(me.data.id)}`, displayName: host, username, accountType: "site", profileUrl: site,
      avatarUrl: str(obj(me.data.avatar_urls)["96"]) || null, tokens: { accessToken: password, expiresAt: null, extra: { site, username } }, meta: { site },
    }];
  },

  async publish(account, input) {
    const site = str(account.tokens.extra?.site) || str(account.meta.site);
    const auth = wpAuth(str(account.tokens.extra?.username) || (account.username ?? ""), account.tokens.accessToken);
    if (!site) throw new ProviderError("This WordPress connection is missing its site address. Reconnect it.");

    // Images go into the Media Library so the site serves them itself.
    const uploaded: { id: number; url: string; alt: string }[] = [];
    for (const image of input.media.filter(isImage)) {
      const res = await api(`${site}/wp-json/wp/v2/media`, {
        method: "POST", timeoutMs: 120_000,
        headers: { ...auth, "Content-Type": image.mimeType, "Content-Disposition": `attachment; filename="${image.fileName.replace(/[^\w.\-]+/g, "-")}"` },
        body: new Uint8Array(await download(image.url)),
      });
      const id = Number(res.data.id);
      if (image.altText) await api(`${site}/wp-json/wp/v2/media/${id}`, { headers: auth, json: { alt_text: image.altText } }).catch(() => undefined);
      uploaded.push({ id, url: str(res.data.source_url), alt: image.altText ?? "" });
    }

    const lines = input.text.trim().split("\n");
    const title = str(input.options.title).trim() || lines[0].slice(0, 140) || "Boardroom Governance Summit update";
    // When the first line became the headline, don't repeat it as the opening paragraph.
    const body = str(input.options.title).trim() ? input.text : lines.slice(1).join("\n").trim() || input.text;
    const gallery = uploaded.slice(1).map((m) => `<figure class="wp-block-image"><img src="${esc(m.url)}" alt="${esc(m.alt)}"/></figure>`).join("\n");
    const link = input.link ? `<p><a href="${esc(input.link)}">${esc(input.link)}</a></p>` : "";

    const res = await api(`${site}/wp-json/wp/v2/posts`, {
      headers: auth,
      json: { title, content: [toHtml(body), gallery, link].filter(Boolean).join("\n"), status: input.options.wp_status === "draft" ? "draft" : "publish", ...(uploaded[0] ? { featured_media: uploaded[0].id } : {}) },
    });
    return { status: "published", externalId: str(res.data.id), url: str(res.data.link) || null };
  },
};

// ── Bluesky (AT Protocol + app password) ────────────────────────────────────
type Session = { accessJwt: string; did: string; handle: string; service: string };

async function blueskySession(service: string, identifier: string, password: string): Promise<Session> {
  try {
    const { data } = await api(`${service}/xrpc/com.atproto.server.createSession`, { json: { identifier, password } });
    return { accessJwt: str(data.accessJwt), did: str(data.did), handle: str(data.handle), service };
  } catch (err) {
    if (err instanceof ProviderError && (err.status === 401 || err.status === 400)) throw new ProviderError("Bluesky rejected that handle and app password.", err.status, true);
    throw err;
  }
}

/** Links and hashtags only become clickable when their byte ranges are declared. */
function facets(text: string) {
  const bytes = (s: string) => Buffer.byteLength(s, "utf8");
  const found: Record<string, unknown>[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s]+[^\s.,;:!?)]/g)) {
    found.push({ index: { byteStart: bytes(text.slice(0, m.index)), byteEnd: bytes(text.slice(0, m.index! + m[0].length)) }, features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }] });
  }
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]+)/gu)) {
    const start = m.index! + m[1].length;
    found.push({ index: { byteStart: bytes(text.slice(0, start)), byteEnd: bytes(text.slice(0, start + 1 + m[2].length)) }, features: [{ $type: "app.bsky.richtext.facet#tag", tag: m[2] }] });
  }
  return found;
}

export const bluesky: Provider = {
  id: "bluesky",

  async connect(fields) {
    const service = fields.service?.trim() ? normaliseUrl(fields.service) : "https://bsky.social";
    const identifier = (fields.identifier ?? "").trim().replace(/^@/, "");
    const session = await blueskySession(service, identifier, fields.password ?? "");
    let avatar: string | null = null, name = session.handle;
    try {
      const profile = await api(`${service}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(session.did)}`, { bearer: session.accessJwt });
      avatar = str(profile.data.avatar) || null;
      name = str(profile.data.displayName) || session.handle;
    } catch { /* profile details are optional */ }
    return [{
      provider: "bluesky", externalId: session.did, displayName: name, username: session.handle, avatarUrl: avatar, accountType: "account",
      profileUrl: `https://bsky.app/profile/${session.handle}`, tokens: { accessToken: fields.password ?? "", expiresAt: null, extra: { service, identifier } },
    }];
  },

  async publish(account, input) {
    const service = str(account.tokens.extra?.service) || "https://bsky.social";
    const session = await blueskySession(service, str(account.tokens.extra?.identifier) || (account.username ?? ""), account.tokens.accessToken);
    const text = [input.text, input.link].filter(Boolean).join("\n\n");

    const images = [];
    for (const image of input.media.filter(isImage).slice(0, 4)) {
      const bytes = await download(image.jpegUrl ?? image.url); // Bluesky caps blobs at about 1 MB: the JPEG copy keeps us under it
      if (bytes.length > 976_000) throw new ProviderError(`“${image.fileName}” is too large for Bluesky (1 MB per image). Re-upload it to create a lighter copy.`);
      const blob = await api(`${service}/xrpc/com.atproto.repo.uploadBlob`, { method: "POST", bearer: session.accessJwt, headers: { "Content-Type": image.jpegUrl ? "image/jpeg" : image.mimeType }, body: new Uint8Array(bytes) });
      images.push({ alt: image.altText ?? "", image: blob.data.blob });
    }

    const record: Record<string, unknown> = { $type: "app.bsky.feed.post", text, createdAt: new Date().toISOString(), langs: ["en"], facets: facets(text) };
    if (images.length) record.embed = { $type: "app.bsky.embed.images", images };
    const res = await api(`${service}/xrpc/com.atproto.repo.createRecord`, { bearer: session.accessJwt, json: { repo: session.did, collection: "app.bsky.feed.post", record } });
    const rkey = str(res.data.uri).split("/").pop() ?? "";
    return { status: "published", externalId: str(res.data.uri), url: rkey ? `https://bsky.app/profile/${session.handle}/post/${rkey}` : null };
  },
};

// ── Mastodon ────────────────────────────────────────────────────────────────
export const mastodon: Provider = {
  id: "mastodon",

  async connect(fields) {
    const instance = normaliseUrl(fields.instance ?? "");
    const token = (fields.token ?? "").trim();
    const { data } = await api(`${instance}/api/v1/accounts/verify_credentials`, { bearer: token });
    return [{
      provider: "mastodon", externalId: `${new URL(instance).hostname}:${str(data.id)}`, displayName: str(data.display_name) || str(data.username), username: `${str(data.username)}@${new URL(instance).hostname}`,
      avatarUrl: str(data.avatar) || null, accountType: "account", profileUrl: str(data.url) || null, tokens: { accessToken: token, expiresAt: null, extra: { instance } },
    }];
  },

  async publish(account, input) {
    const instance = str(account.tokens.extra?.instance);
    const token = account.tokens.accessToken;
    const mediaIds: string[] = [];
    for (const m of input.media.slice(0, 4)) {
      const form = new FormData();
      form.set("file", new Blob([new Uint8Array(await download(m.url))], { type: m.mimeType }), m.fileName);
      if (m.altText) form.set("description", m.altText.slice(0, 1500));
      const res = await api(`${instance}/api/v2/media`, { method: "POST", bearer: token, body: form, timeoutMs: 120_000 });
      const id = str(res.data.id);
      // 202 = still transcoding; the status can't attach it until it is ready.
      for (let attempt = 0; res.status === 202 && attempt < 15; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        const check = await api(`${instance}/api/v1/media/${id}`, { bearer: token }).catch(() => null);
        if (check && check.status === 200 && str(check.data.url)) break;
      }
      mediaIds.push(id);
    }
    const res = await api(`${instance}/api/v1/statuses`, { bearer: token, json: { status: [input.text, input.link].filter(Boolean).join("\n\n"), media_ids: mediaIds, visibility: "public" } });
    return { status: "published", externalId: str(res.data.id), url: str(res.data.url) || null };
  },
};

// ── Telegram (bot → channel) ────────────────────────────────────────────────
const tg = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

export const telegram: Provider = {
  id: "telegram",

  async connect(fields) {
    const token = (fields.token ?? "").trim();
    const chat = (fields.chat ?? "").trim();
    if (!/^\d+:[\w-]{30,}$/.test(token)) throw new ProviderError("That doesn't look like a bot token. Copy it from @BotFather.");
    const chatId = /^-?\d+$/.test(chat) ? chat : `@${chat.replace(/^@|^https?:\/\/t\.me\//, "")}`;
    let info;
    try {
      info = obj((await api(tg(token, "getChat"), { json: { chat_id: chatId } })).data.result);
    } catch {
      throw new ProviderError("Telegram couldn't find that channel with this bot. Add the bot to the channel as an administrator, then try again.");
    }
    const username = str(info.username);
    return [{
      provider: "telegram", externalId: str(info.id), displayName: str(info.title) || chatId, username: username || null, accountType: "channel",
      profileUrl: username ? `https://t.me/${username}` : null, tokens: { accessToken: token, expiresAt: null, extra: { chat_id: str(info.id) } },
    }];
  },

  async publish(account, input) {
    const token = account.tokens.accessToken;
    const chat_id = str(account.tokens.extra?.chat_id) || account.externalId;
    const text = [input.text, input.link].filter(Boolean).join("\n\n");
    const media = input.media.slice(0, 10);
    const kind = (m: PublishMedia) => (isVideo(m) ? "video" : "photo");

    let result: Record<string, unknown>;
    if (!media.length) {
      result = obj((await api(tg(token, "sendMessage"), { json: { chat_id, text } })).data.result);
    } else if (media.length === 1) {
      const m = media[0];
      // Captions stop at 1,024 characters: longer copy follows as its own message.
      const caption = text.length <= 1024 ? text : undefined;
      result = obj((await api(tg(token, isVideo(m) ? "sendVideo" : "sendPhoto"), { json: { chat_id, [kind(m)]: m.url, caption }, timeoutMs: 120_000 })).data.result);
      if (!caption && text) await api(tg(token, "sendMessage"), { json: { chat_id, text } });
    } else {
      const album = media.map((m, i) => ({ type: kind(m), media: m.url, ...(i === 0 && text.length <= 1024 ? { caption: text } : {}) }));
      result = list((await api(tg(token, "sendMediaGroup"), { json: { chat_id, media: album }, timeoutMs: 120_000 })).data.result)[0] ?? {};
      if (text.length > 1024) await api(tg(token, "sendMessage"), { json: { chat_id, text } });
    }
    const id = str(result.message_id);
    return { status: "published", externalId: id, url: account.username && id ? `https://t.me/${account.username}/${id}` : null };
  },
};

// ── Practice channel: exercises the whole pipeline, posts nowhere ───────────
export const sandbox: Provider = {
  id: "sandbox",
  async publish(_account, input) {
    if (/\[fail\]/i.test(input.text)) throw new ProviderError("Practice failure: the post contained “[fail]”, which this channel rejects on purpose so you can rehearse a retry.");
    // Video takes a minute elsewhere, so rehearse that too: the first pass reports "processing".
    if (input.media.some(isVideo) && !input.pending) return { status: "pending", state: { step: "processing" }, note: "Practice channel is “processing” the video." };
    return { status: "published", externalId: `practice-${Date.now().toString(36)}`, url: null };
  },
};
