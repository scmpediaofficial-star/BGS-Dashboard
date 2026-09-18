import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import { decryptJson, safeEqual } from "@/lib/crypto";
import { recordEvent } from "@/lib/events";
import { getApp, saveDiscovered } from "@/lib/social/accounts";
import { PROVIDERS, isProviderId } from "@/lib/social/catalog";
import { getProvider } from "@/lib/social/providers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Pending = { state: string; verifier: string; provider: string; userId: string; redirectUri: string };

/** Step 2: the network sends the admin back with a code; trade it for tokens and store every account it unlocks. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/social/oauth/[provider]/callback">) {
  const { provider } = await params;
  const done = (query: Record<string, string>) => {
    const response = NextResponse.redirect(new URL(`/social/accounts?${new URLSearchParams(query)}`, request.url));
    response.cookies.delete({ name: "bgs_oauth", path: "/api/social/oauth" });
    return response;
  };

  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (!can(session.role, "social.accounts")) return done({ error: "Only administrators can connect channels." });

  const query = request.nextUrl.searchParams;
  const denied = query.get("error_description") ?? query.get("error");
  if (denied) return done({ error: `The network declined the connection: ${denied.slice(0, 200)}` });

  const pending = decryptJson<Pending>(request.cookies.get("bgs_oauth")?.value);
  const code = query.get("code");
  const state = query.get("state") ?? "";
  if (!pending || !code || !isProviderId(provider) || pending.provider !== provider || pending.userId !== session.userId || !safeEqual(pending.state, state)) {
    return done({ error: "That connection attempt expired or didn't start here. Please press Connect again." });
  }

  try {
    const adapter = getProvider(provider).oauth;
    const app = await getApp(provider);
    if (!adapter || !app) return done({ setup: provider });

    const tokens = await adapter.exchange(app, pending.redirectUri, code, pending.verifier);
    if (!tokens.accessToken) throw new Error("The network returned no access token.");
    const accounts = await adapter.discover(app, tokens);
    const saved = await saveDiscovered(accounts, session.userId);

    await recordEvent({
      actor: { id: session.userId, name: session.profile.full_name }, action: "social.account_connected", category: "social", audience: "admins", importance: "high", tone: "good",
      summary: `connected ${saved.length} ${PROVIDERS[provider].name} channel${saved.length === 1 ? "" : "s"}`,
      facts: saved.slice(0, 8).map((a) => ({ label: PROVIDERS[a.provider].name, value: a.name })), link: "/social/accounts",
    });
    revalidatePath("/", "layout");
    return done({ connected: String(saved.length), provider });
  } catch (err) {
    console.error(`[oauth:${provider}]`, err instanceof Error ? err.message : err);
    return done({ error: err instanceof Error ? err.message.slice(0, 240) : "The connection failed. Please try again." });
  }
}
