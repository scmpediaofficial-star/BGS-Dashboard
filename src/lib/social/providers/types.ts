import "server-only";

import type { ProviderId } from "@/lib/social/catalog";

/** Developer-app credentials an admin saved for an OAuth network. */
export type AppCredentials = { clientId: string; clientSecret: string; extra: Record<string, unknown> };

export type TokenSet = {
  accessToken: string;
  refreshToken?: string | null;
  /** ISO timestamp; null/undefined = does not expire. */
  expiresAt?: string | null;
  scopes?: string[];
  /** Anything else the adapter needs later (kept encrypted). */
  extra?: Record<string, unknown>;
};

export type DiscoveredAccount = {
  provider: ProviderId;
  externalId: string;
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
  accountType: string;
  profileUrl?: string | null;
  tokens: TokenSet;
  meta?: Record<string, unknown>;
};

export type PublishMedia = {
  url: string;
  /** A ≤2048px JPEG copy made at upload time; networks that insist on JPEG or small files use it. */
  jpegUrl: string | null;
  mimeType: string;
  altText: string | null;
  sizeBytes: number;
  fileName: string;
};

export type AccountContext = {
  id: string;
  provider: ProviderId;
  externalId: string;
  username: string | null;
  profileUrl: string | null;
  meta: Record<string, unknown>;
  tokens: TokenSet;
};

export type PublishInput = {
  text: string;
  link: string | null;
  media: PublishMedia[];
  options: Record<string, unknown>;
  /** State returned by an earlier `pending` outcome — the adapter resumes from it. */
  pending: Record<string, unknown> | null;
};

/**
 * Networks that transcode video finish minutes later. Rather than hold a
 * serverless function open, the adapter returns `pending` with whatever it
 * needs to resume; the every-minute dispatcher calls it again until it settles.
 */
export type PublishOutcome =
  | { status: "published"; externalId: string; url: string | null }
  | { status: "pending"; state: Record<string, unknown>; note: string };

export type OAuthAdapter = {
  pkce?: boolean;
  scopes(app: AppCredentials): string[];
  authUrl(app: AppCredentials, redirectUri: string, state: string, codeChallenge: string): string;
  exchange(app: AppCredentials, redirectUri: string, code: string, codeVerifier: string): Promise<TokenSet>;
  /** Everything this login can publish to (pages, linked Instagram accounts, the profile itself…). */
  discover(app: AppCredentials, tokens: TokenSet): Promise<DiscoveredAccount[]>;
  /** Returns fresh tokens, or null when the network offers no refresh (the account must be reconnected). */
  refresh?(app: AppCredentials, tokens: TokenSet): Promise<TokenSet | null>;
};

export type Provider = {
  id: ProviderId;
  oauth?: OAuthAdapter;
  /** Token / app-password networks: verify the pasted values and describe the account. */
  connect?(fields: Record<string, string>): Promise<DiscoveredAccount[]>;
  publish(account: AccountContext, input: PublishInput, app: AppCredentials | null): Promise<PublishOutcome>;
};

export const isImage = (m: PublishMedia) => m.mimeType.startsWith("image/");
export const isVideo = (m: PublishMedia) => m.mimeType.startsWith("video/");
