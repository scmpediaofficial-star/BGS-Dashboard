"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Copy, ExternalLink, KeyRound, Plug, RefreshCw, Settings2, Timer, Unplug } from "lucide-react";
import { toast } from "sonner";
import { addPracticeChannel, connectWithCredentials, disconnectAccount, saveProviderApp } from "@/app/(app)/social/actions";
import { BrandIcon } from "@/components/social/brand-icon";
import { MediaLibrary, type MediaItem } from "@/components/social/media-library";
import { useViewer } from "@/components/shell/session-context";
import { useAction } from "@/components/shared/use-action";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { PROVIDERS, PROVIDER_ORDER, type ProviderId } from "@/lib/social/catalog";
import { daysUntil, formatDate } from "@/lib/utils";

type Account = { id: string; provider: string; display_name: string; username: string | null; avatar_url: string | null; account_type: string; profile_url: string | null; status: string; status_detail: string | null; token_expires_at: string | null };
type Apps = Partial<Record<ProviderId, { clientId: string; extra: Record<string, unknown> }>>;
type Notice = { connected: string | null; provider: string | null; error: string | null; setup: string | null };

export function SocialAccountsView({ accounts, media, apps, notice }: { accounts: Account[]; media: MediaItem[]; apps: Apps; notice: Notice }) {
  const { can } = useViewer();
  const router = useRouter();
  const admin = can("social.accounts");
  useRealtimeRefresh(["social_accounts", "social_media"]);

  const [setupFor, setSetupFor] = useState<ProviderId | null>(notice.setup && notice.setup in PROVIDERS ? (notice.setup as ProviderId) : null);
  const [credentialsFor, setCredentialsFor] = useState<ProviderId | null>(null);
  const [disconnecting, setDisconnecting] = useState<Account | null>(null);

  // Report how the OAuth round-trip ended, then tidy the URL so a refresh doesn't repeat it.
  useEffect(() => {
    if (notice.connected) toast.success(`Connected ${notice.connected} channel${notice.connected === "1" ? "" : "s"}${notice.provider && notice.provider in PROVIDERS ? ` from ${PROVIDERS[notice.provider as ProviderId].name}` : ""}.`);
    if (notice.error) toast.error(notice.error, { duration: 12000 });
    if (notice.connected || notice.error || notice.setup) router.replace("/social/accounts", { scroll: false });
  }, [notice.connected, notice.error, notice.provider, notice.setup, router]);

  const [disconnect, disconnectPending] = useAction(disconnectAccount, { success: "Channel disconnected", onSuccess: () => setDisconnecting(null) });
  const [practice, practicePending] = useAction(addPracticeChannel);

  function connect(provider: ProviderId) {
    const info = PROVIDERS[provider];
    if (info.auth === "none") return practice();
    if (info.auth === "credentials") return setCredentialsFor(provider);
    const owner = info.appProvider ?? provider;
    if (!apps[owner]) return setSetupFor(owner);
    window.location.assign(`/api/social/oauth/${provider}/start`); // off to the network's own sign-in
  }

  const active = accounts.filter((a) => a.status === "active");
  const broken = accounts.filter((a) => a.status !== "active" && a.status_detail !== "Disconnected by an administrator");

  return (
    <>
      <PageHeader
        eyebrow="Social Studio"
        title="Channels & media"
        description="Connect the summit's accounts once; everyone then publishes through them with their own BGS login. Logins are stored encrypted and never shown again."
        actions={<Button asChild variant="outline"><Link href="/social">Back to calendar</Link></Button>}
      />

      {broken.length > 0 && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-card border border-critical/30 bg-critical-soft px-4 py-3 text-[13px] text-critical-ink">
          <CircleAlert className="mt-0.5 size-4.5 shrink-0" aria-hidden />
          <p><strong className="font-bold">{broken.length === 1 ? "A channel needs" : `${broken.length} channels need`} reconnecting.</strong> Scheduled posts to {broken.map((a) => a.display_name).join(", ")} will fail until {admin ? "you press Reconnect below" : "an administrator reconnects them"}.</p>
        </div>
      )}

      <Card className="mb-5">
        <CardHeader title="Connected channels" description={active.length ? `${active.length} ready to publish` : "Nothing connected yet — pick a network below."} />
        <CardBody>
          {accounts.filter((a) => a.status === "active" || broken.includes(a)).length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-ink-3">
              {admin ? "Start with the Practice channel to rehearse the workflow, then connect LinkedIn — it takes about five minutes." : "An administrator connects the summit's accounts here."}
            </p>
          ) : (
            <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {accounts.filter((a) => a.status === "active" || broken.includes(a)).map((account) => {
                const provider = account.provider as ProviderId;
                const ok = account.status === "active";
                const days = account.token_expires_at ? daysUntil(account.token_expires_at) : null;
                const renews = provider === "x" || provider === "tiktok" || provider === "threads"; // renewed automatically, no warning needed
                const expiring = ok && !renews && days !== null && days <= 10;
                return (
                  <li key={account.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                    <span className="relative shrink-0">
                      <Avatar name={account.display_name} src={account.avatar_url} size="md" />
                      {provider in PROVIDERS && <BrandIcon provider={provider} size="xs" className="absolute -bottom-1 -right-1 ring-2 ring-surface" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-ink">
                        <span className="truncate">{account.display_name}</span>
                        {account.profile_url && <a href={account.profile_url} target="_blank" rel="noreferrer" aria-label={`Open ${account.display_name}`} className="text-ink-3 hover:text-accent-ink"><ExternalLink className="size-3.5" /></a>}
                      </p>
                      <p className="truncate text-xs text-ink-3">{PROVIDERS[provider]?.name ?? account.provider} · {account.account_type}{account.username ? ` · ${account.username.startsWith("@") || account.username.includes("@") ? "" : "@"}${account.username}` : ""}</p>
                      <div className="mt-1.5">
                        {!ok ? <Badge tone="critical" icon={CircleAlert} size="sm">Needs reconnecting</Badge>
                          : expiring ? <Badge tone="warning" icon={Timer} size="sm">Login ends {formatDate(account.token_expires_at, { year: false })}</Badge>
                          : <Badge tone="good" icon={CircleCheck} size="sm">Ready</Badge>}
                      </div>
                    </div>
                    {admin && (
                      <div className="flex shrink-0 flex-col gap-1">
                        {(!ok || expiring) && provider in PROVIDERS && <Button size="sm" onClick={() => connect(provider)}><RefreshCw /> Reconnect</Button>}
                        <Button variant="ghost" size="sm" onClick={() => setDisconnecting(account)}><Unplug /> Disconnect</Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card className="mb-5">
        <CardHeader title="Networks" description="Free to connect. Networks marked “app” need a free developer app first — the setup guide walks you through it." />
        <CardBody>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {PROVIDER_ORDER.map((id) => {
              const info = PROVIDERS[id];
              const owner = info.appProvider ?? id;
              const needsApp = info.auth === "oauth";
              const hasApp = Boolean(apps[owner]);
              const count = active.filter((a) => a.provider === id).length;
              return (
                <li key={id} className="flex flex-col rounded-xl border border-line p-4">
                  <div className="flex items-start gap-3">
                    <BrandIcon provider={id} size="lg" />
                    <div className="min-w-0 flex-1">
                      <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
                        {info.name}
                        {count > 0 && <Badge tone="good" size="sm">{count} connected</Badge>}
                        {needsApp && <Badge tone={hasApp ? "neutral" : "gold"} size="sm" icon={KeyRound}>{hasApp ? "App ready" : "App needed"}</Badge>}
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-ink-3">{info.blurb}</p>
                    </div>
                  </div>
                  {admin && (
                    <div className="mt-3.5 flex flex-wrap gap-2 pt-0.5">
                      <Button size="sm" variant={needsApp && !hasApp ? "outline" : "primary"} loading={id === "sandbox" && practicePending} disabled={id === "sandbox" && count > 0} onClick={() => connect(id)}>
                        <Plug /> {id === "sandbox" ? (count ? "Added" : "Add") : count ? "Connect another" : "Connect"}
                      </Button>
                      {needsApp && !info.appProvider && <Button size="sm" variant="ghost" onClick={() => setSetupFor(id)}><Settings2 /> {hasApp ? "Edit app" : "Set up app"}</Button>}
                      {info.appProvider && <p className="self-center text-[11px] text-ink-3">Uses the {PROVIDERS[info.appProvider].name} app</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Media library" description="Artwork and clips for posts. Every image also gets a light JPEG copy, because Instagram and Bluesky insist on one." />
        <CardBody><MediaLibrary media={media} /></CardBody>
      </Card>

      {setupFor && <AppSetupDialog provider={setupFor} existing={apps[setupFor]} onClose={() => setSetupFor(null)} />}
      {credentialsFor && <CredentialsDialog provider={credentialsFor} onClose={() => setCredentialsFor(null)} />}
      <ConfirmDialog
        open={Boolean(disconnecting)} onOpenChange={(open) => !open && setDisconnecting(null)} destructive loading={disconnectPending}
        title={`Disconnect ${disconnecting?.display_name ?? ""}?`} confirmLabel="Disconnect"
        description="Its saved login is deleted. Posts already scheduled to this channel will fail until it is connected again. Published history is kept."
        onConfirm={() => disconnecting && disconnect(disconnecting.id)}
      />
    </>
  );
}

function AppSetupDialog({ provider, existing, onClose }: { provider: ProviderId; existing?: { clientId: string; extra: Record<string, unknown> }; onClose: () => void }) {
  const info = PROVIDERS[provider];
  // This dialog only ever mounts in the browser (after a click), so the origin is known up front.
  const [redirect] = useState(() => (typeof window === "undefined" ? "" : `${window.location.origin}/api/social/oauth/${provider}/callback`));
  const [clientId, setClientId] = useState(existing?.clientId ?? "");
  const [secret, setSecret] = useState("");
  const [pages, setPages] = useState(Boolean(existing?.extra.pages));
  const [save, saving] = useAction(saveProviderApp, { onSuccess: onClose });
  const copy = () => navigator.clipboard.writeText(redirect).then(() => toast.success("Redirect URL copied"));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`${info.name} developer app`} size="md"
        description={`${info.name} only lets registered apps publish. It's free and you do it once.`}
        footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="app-form" type="submit" loading={saving}>Save app</Button></>}
      >
        <ol className="grid gap-3">
          <li className="flex gap-3 text-[13px] text-ink-2">
            <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent-ink">1</span>
            <span>Open <a href={info.setup!.portal} target="_blank" rel="noreferrer" className="font-semibold text-accent-ink underline-offset-2 hover:underline">{info.setup!.portalLabel} <ExternalLink className="inline size-3" /></a>.</span>
          </li>
          {info.setup!.steps.map((step, index) => {
            const [before, after] = step.split("{redirect}");
            return (
              <li key={step} className="flex gap-3 text-[13px] leading-relaxed text-ink-2">
                <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent-ink">{index + 2}</span>
                <span className="min-w-0 flex-1">
                  {before}
                  {after !== undefined && (
                    <span className="mt-1.5 flex items-center gap-2 rounded-lg border border-line bg-surface-2 py-1 pl-3 pr-1">
                      <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{redirect}</code>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={copy} aria-label="Copy redirect URL"><Copy /></Button>
                    </span>
                  )}
                  {after}
                </span>
              </li>
            );
          })}
        </ol>
        {info.setup!.review && <p className="mt-4 rounded-xl bg-gold-soft px-3.5 py-2.5 text-xs leading-relaxed text-gold-ink">{info.setup!.review}</p>}

        <form id="app-form" className="mt-5 grid gap-4 border-t border-line pt-5" onSubmit={(e) => { e.preventDefault(); save({ provider, client_id: clientId, client_secret: secret, pages }); }}>
          <Field label={provider === "tiktok" ? "Client key" : provider === "facebook" || provider === "threads" ? "App ID" : "Client ID"} htmlFor="app-id">
            <Input id="app-id" value={clientId} onChange={(e) => setClientId(e.target.value)} required autoComplete="off" spellCheck={false} />
          </Field>
          <Field label={provider === "facebook" || provider === "threads" ? "App secret" : "Client secret"} htmlFor="app-secret" hint={existing ? "Saved. Leave empty to keep it, or paste a new one to replace it." : "Stored encrypted; it is never displayed again."}>
            <Input id="app-secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} required={!existing} autoComplete="off" />
          </Field>
          {provider === "linkedin" && (
            <label className="flex items-start gap-2.5 text-[13px] text-ink-2">
              <Checkbox checked={pages} onCheckedChange={(v) => setPages(v === true)} className="mt-0.5" />
              <span><strong className="font-semibold text-ink">Company pages</strong> — tick only after LinkedIn has granted this app the Community Management API. Until then, connecting with it ticked will be refused.</span>
            </label>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CredentialsDialog({ provider, onClose }: { provider: ProviderId; onClose: () => void }) {
  const info = PROVIDERS[provider];
  const [values, setValues] = useState<Record<string, string>>({});
  const [connect, connecting] = useAction(connectWithCredentials, { onSuccess: onClose });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Connect ${info.name}`} size="sm" description="We check these against the live service before saving anything."
        footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="cred-form" type="submit" loading={connecting}>Verify &amp; connect</Button></>}
      >
        <form id="cred-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); connect(provider, values); }}>
          {info.fields!.map((field) => (
            <Field key={field.name} label={field.label} htmlFor={`cred-${field.name}`} hint={field.hint} optional={field.optional}>
              <Input
                id={`cred-${field.name}`} type={field.secret ? "password" : field.type === "url" ? "url" : "text"} inputMode={field.type === "url" ? "url" : undefined}
                value={values[field.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                placeholder={field.placeholder} required={!field.optional} autoComplete="off" autoCapitalize="none" spellCheck={false}
              />
            </Field>
          ))}
        </form>
      </DialogContent>
    </Dialog>
  );
}
