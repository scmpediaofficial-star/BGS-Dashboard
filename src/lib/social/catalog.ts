/**
 * The networks Social Studio can publish to — client-safe metadata only.
 * (Server-side adapters live in ./providers/*.)
 *
 * Two ways a channel connects:
 *  - "oauth": the network requires a free developer app. An admin pastes its
 *    client ID + secret once (Settings stay in Supabase, encrypted), then
 *    anyone with access clicks Connect and signs in on the network itself.
 *  - "credentials": the network issues a personal token/app password, so there
 *    is no developer app at all — paste and go.
 */

export type ProviderId =
  | "linkedin" | "facebook" | "instagram" | "threads" | "x" | "tiktok"
  | "wordpress" | "bluesky" | "mastodon" | "telegram" | "sandbox";

export type CredentialField = { name: string; label: string; placeholder?: string; hint?: string; secret?: boolean; type?: "text" | "url"; optional?: boolean };

export type ProviderInfo = {
  id: ProviderId;
  name: string;
  /** What a connected account is called on this network. */
  accountNoun: string;
  color: string;
  auth: "oauth" | "credentials" | "none";
  /** Instagram and Threads accounts ride on another provider's developer app. */
  appProvider?: ProviderId;
  maxChars: number;
  maxImages: number;
  maxVideos: number;
  /** Feed posts on this network cannot be text-only. */
  requiresMedia?: boolean;
  videoOnly?: boolean;
  fields?: CredentialField[];
  /** Developer-app setup, shown step by step to admins. `{redirect}` is replaced with this deployment's callback URL. */
  setup?: { portal: string; portalLabel: string; steps: string[]; review?: string };
  blurb: string;
};

const REDIRECT = "{redirect}";

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  linkedin: {
    id: "linkedin", name: "LinkedIn", accountNoun: "profile or company page", color: "#0a66c2", auth: "oauth",
    maxChars: 3000, maxImages: 9, maxVideos: 1,
    blurb: "Posts, images and video to a personal profile — and to company pages once LinkedIn approves page access.",
    setup: {
      portal: "https://www.linkedin.com/developers/apps/new", portalLabel: "LinkedIn Developers",
      steps: [
        "Create an app and associate it with the Boardroom Governance Summit company page.",
        "Under Products, add “Share on LinkedIn” and “Sign In with LinkedIn using OpenID Connect” (both approve instantly).",
        `Under Auth, add this redirect URL: ${REDIRECT}`,
        "Copy the Client ID and Client Secret into the form below.",
      ],
      review: "Posting as the company page (not just a personal profile) needs the “Community Management API” product, which LinkedIn reviews — usually a few days. Tick “Company pages” below once it is granted.",
    },
  },
  facebook: {
    id: "facebook", name: "Facebook", accountNoun: "page", color: "#1877f2", auth: "oauth",
    maxChars: 63206, maxImages: 10, maxVideos: 1,
    blurb: "Text, links, photo albums and video to the Pages you manage. One Meta app also unlocks Instagram.",
    setup: {
      portal: "https://developers.facebook.com/apps/creation/", portalLabel: "Meta for Developers",
      steps: [
        "Create an app of type “Business” and add the “Facebook Login for Business” product.",
        `In Facebook Login → Settings, add this Valid OAuth Redirect URI: ${REDIRECT}`,
        "In App settings → Basic, add a Privacy Policy URL (boardroomgovsummit.com/privacy-policy) and switch the app to Live.",
        "Make sure everyone who will connect a Page has a role on the app (App roles → Roles).",
        "Copy the App ID and App Secret into the form below.",
      ],
      review: "People with a role on the app can publish to their own Pages without Meta's App Review. Review is only needed if outsiders will connect.",
    },
  },
  instagram: {
    id: "instagram", name: "Instagram", accountNoun: "professional account", color: "#e1306c", auth: "oauth", appProvider: "facebook",
    maxChars: 2200, maxImages: 10, maxVideos: 1, requiresMedia: true,
    blurb: "Photos, carousels and Reels. The Instagram account must be Professional and linked to a Facebook Page.",
  },
  threads: {
    id: "threads", name: "Threads", accountNoun: "profile", color: "#101010", auth: "oauth",
    maxChars: 500, maxImages: 10, maxVideos: 1,
    blurb: "Text, image and video threads.",
    setup: {
      portal: "https://developers.facebook.com/apps/creation/", portalLabel: "Meta for Developers",
      steps: [
        "Create (or open) a Meta app and add the “Threads API” use case.",
        `In Threads → Settings, add this redirect callback URL: ${REDIRECT}`,
        "Add the Threads profile as a Threads Tester (App roles) and accept the invite in the Threads app.",
        "Copy the Threads App ID and Threads App Secret into the form below.",
      ],
    },
  },
  x: {
    id: "x", name: "X", accountNoun: "account", color: "#0f1419", auth: "oauth",
    maxChars: 280, maxImages: 4, maxVideos: 1,
    blurb: "Posts with up to four images or one video.",
    setup: {
      portal: "https://developer.x.com/en/portal/dashboard", portalLabel: "X Developer Portal",
      steps: [
        "Create a project and app, then open “User authentication settings”.",
        "Choose app permissions “Read and write”, type “Web App”.",
        `Set the Callback URI to: ${REDIRECT}`,
        "Copy the OAuth 2.0 Client ID and Client Secret into the form below.",
      ],
      review: "X decides which API plans may post. If connecting works but publishing is refused, the app's plan does not include write access.",
    },
  },
  tiktok: {
    id: "tiktok", name: "TikTok", accountNoun: "account", color: "#fe2c55", auth: "oauth",
    maxChars: 2200, maxImages: 0, maxVideos: 1, requiresMedia: true, videoOnly: true,
    blurb: "Video posts — sent to your TikTok inbox to finish in the app, or published directly once TikTok audits the app.",
    setup: {
      portal: "https://developers.tiktok.com/apps/", portalLabel: "TikTok for Developers",
      steps: [
        "Create an app and add the products “Login Kit” and “Content Posting API”.",
        "Request the scopes user.info.basic, video.upload and video.publish.",
        `In Login Kit, add this redirect URI: ${REDIRECT}`,
        "Copy the Client Key and Client Secret into the form below.",
      ],
      review: "Until TikTok audits the app, direct posts are private to the account. “Send to TikTok inbox” works straight away: the video lands in the app's inbox for you to add sound and post publicly.",
    },
  },
  wordpress: {
    id: "wordpress", name: "WordPress", accountNoun: "site", color: "#21759b", auth: "credentials",
    maxChars: 100000, maxImages: 10, maxVideos: 0,
    blurb: "Publishes news posts to your website. Images are uploaded to the Media Library; the first becomes the featured image.",
    fields: [
      { name: "site", label: "Site address", type: "url", placeholder: "https://boardroomgovsummit.com" },
      { name: "username", label: "WordPress username", placeholder: "editor" },
      { name: "password", label: "Application password", secret: true, placeholder: "xxxx xxxx xxxx xxxx xxxx xxxx", hint: "WordPress admin → Users → Profile → Application Passwords → add one called “BGS Dashboard”. It is not your login password." },
    ],
  },
  bluesky: {
    id: "bluesky", name: "Bluesky", accountNoun: "account", color: "#0085ff", auth: "credentials",
    maxChars: 300, maxImages: 4, maxVideos: 0,
    blurb: "Posts with up to four images. No developer app needed.",
    fields: [
      { name: "identifier", label: "Handle", placeholder: "boardroomsummit.bsky.social" },
      { name: "password", label: "App password", secret: true, placeholder: "xxxx-xxxx-xxxx-xxxx", hint: "Bluesky → Settings → Privacy and security → App passwords." },
      { name: "service", label: "Server", type: "url", placeholder: "https://bsky.social", optional: true, hint: "Leave empty unless you run your own server." },
    ],
  },
  mastodon: {
    id: "mastodon", name: "Mastodon", accountNoun: "account", color: "#6364ff", auth: "credentials",
    maxChars: 500, maxImages: 4, maxVideos: 1,
    blurb: "Posts with images or video to any Mastodon server.",
    fields: [
      { name: "instance", label: "Server address", type: "url", placeholder: "https://mastodon.social" },
      { name: "token", label: "Access token", secret: true, hint: "Preferences → Development → New application with write:statuses and write:media, then copy “Your access token”." },
    ],
  },
  telegram: {
    id: "telegram", name: "Telegram", accountNoun: "channel", color: "#26a5e4", auth: "credentials",
    maxChars: 4096, maxImages: 10, maxVideos: 1,
    blurb: "Broadcasts to a Telegram channel or group through your bot.",
    fields: [
      { name: "token", label: "Bot token", secret: true, placeholder: "123456:ABC-DEF…", hint: "Message @BotFather → /newbot. Then add the bot to your channel as an administrator." },
      { name: "chat", label: "Channel", placeholder: "@boardroomsummit", hint: "The channel's @username, or its numeric chat ID." },
    ],
  },
  sandbox: {
    id: "sandbox", name: "Practice channel", accountNoun: "channel", color: "#804a95", auth: "none",
    maxChars: 3000, maxImages: 10, maxVideos: 1,
    blurb: "Goes through every step — approval, schedule, publishing, alerts — without posting anywhere. Ideal for training and dry runs.",
  },
};

export const PROVIDER_ORDER: ProviderId[] = ["linkedin", "facebook", "instagram", "x", "tiktok", "threads", "wordpress", "bluesky", "telegram", "mastodon", "sandbox"];
export const isProviderId = (value: string): value is ProviderId => value in PROVIDERS;

export type MediaKind = { mime_type: string };
const isImage = (m: MediaKind) => m.mime_type.startsWith("image/");
const isVideo = (m: MediaKind) => m.mime_type.startsWith("video/");

/** X counts every link as 23 characters; everything else counts code points. */
export function countChars(provider: ProviderId, text: string): number {
  if (provider !== "x") return [...text].length;
  const withoutLinks = text.replace(/https?:\/\/\S+/g, "");
  const links = text.match(/https?:\/\/\S+/g)?.length ?? 0;
  return [...withoutLinks].length + links * 23;
}

/** Why this post can't go to this network as it stands — or null when it can. Shared by the composer and the server. */
export function validateForProvider(provider: ProviderId, text: string, media: MediaKind[]): string | null {
  const p = PROVIDERS[provider];
  const images = media.filter(isImage).length;
  const videos = media.filter(isVideo).length;
  const chars = countChars(provider, text);
  if (chars > p.maxChars) return `${p.name} allows ${p.maxChars.toLocaleString("en-GB")} characters — this is ${chars.toLocaleString("en-GB")}.`;
  if (p.videoOnly && videos !== 1) return `${p.name} needs exactly one video.`;
  if (p.requiresMedia && images + videos === 0) return `${p.name} needs an image or a video.`;
  if (videos > p.maxVideos) return p.maxVideos ? `${p.name} takes one video per post.` : `${p.name} can't take video here — use images.`;
  if (images > p.maxImages) return p.maxImages ? `${p.name} takes up to ${p.maxImages} images.` : `${p.name} takes video only.`;
  if (videos && images) return `${p.name} can't mix images and video in one post.`;
  if (!text.trim() && !media.length) return "Write something or attach media.";
  return null;
}

/** `{{event}}`, `{{days}}`, `{{date}}`, `{{venue}}`, `{{website}}` in templates and posts. */
export function fillVariables(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => (key.toLowerCase() in vars ? String(vars[key.toLowerCase()]) : match));
}
