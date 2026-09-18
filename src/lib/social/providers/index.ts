import "server-only";

import { PROVIDERS, type ProviderId } from "@/lib/social/catalog";
import { linkedin } from "@/lib/social/providers/linkedin";
import { facebook, instagram } from "@/lib/social/providers/meta";
import { bluesky, mastodon, sandbox, telegram, wordpress } from "@/lib/social/providers/simple";
import { threads } from "@/lib/social/providers/threads";
import { tiktok } from "@/lib/social/providers/tiktok";
import type { Provider } from "@/lib/social/providers/types";
import { x } from "@/lib/social/providers/x";

const REGISTRY: Record<ProviderId, Provider> = { linkedin, facebook, instagram, threads, x, tiktok, wordpress, bluesky, mastodon, telegram, sandbox };

export const getProvider = (id: ProviderId): Provider => REGISTRY[id];

/** The provider whose developer app (and OAuth login) serves this network — Instagram rides on Facebook's. */
export const appProviderFor = (id: ProviderId): ProviderId => PROVIDERS[id].appProvider ?? id;
