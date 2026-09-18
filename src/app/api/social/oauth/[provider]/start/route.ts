import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import { encryptJson } from "@/lib/crypto";
import { getApp } from "@/lib/social/accounts";
import { PROVIDERS, isProviderId } from "@/lib/social/catalog";
import { appProviderFor, getProvider } from "@/lib/social/providers";

export const dynamic = "force-dynamic";

const back = (request: NextRequest, params: Record<string, string>) => NextResponse.redirect(new URL(`/social/accounts?${new URLSearchParams(params)}`, request.url));

/** Step 1 of connecting an OAuth network: send the admin to the network's own consent screen. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/social/oauth/[provider]/start">) {
  const { provider } = await params;
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (!can(session.role, "social.accounts")) return back(request, { error: "Only administrators can connect channels." });
  if (!isProviderId(provider) || PROVIDERS[provider].auth !== "oauth") return back(request, { error: "That network doesn't connect this way." });

  const owner = appProviderFor(provider);
  const adapter = getProvider(owner).oauth;
  const app = await getApp(owner);
  if (!adapter || !app) return back(request, { setup: owner });

  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = `${request.nextUrl.origin}/api/social/oauth/${owner}/callback`;

  const response = NextResponse.redirect(adapter.authUrl(app, redirectUri, state, challenge));
  // Encrypted and bound to this admin: the callback refuses anything that doesn't match.
  response.cookies.set("bgs_oauth", encryptJson({ state, verifier, provider: owner, userId: session.userId, redirectUri }), {
    httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/api/social/oauth", maxAge: 600,
  });
  return response;
}
