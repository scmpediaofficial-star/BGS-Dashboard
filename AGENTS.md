<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# BGS Dashboard — project guide

Planning, production and social command centre for the **Boardroom Governance Summit** (7 Oct 2026, Labadi Beach Hotel, Accra).
Next.js 16.3 App Router · Supabase (Postgres, Auth, Realtime, Storage) · Resend · PWA · deployed on Vercel.

## Run it

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"   # supabase-js needs Node ≥ 22; the default shell Node is 20
npm run db:start      # local Supabase (Docker Desktop must be running)
npm run dev           # http://localhost:3000
npx tsc --noEmit      # typecheck — must stay clean
```

## Architecture (read before adding a feature)

| Concern | Where | Rule |
|---|---|---|
| Session & roles | `src/lib/auth/session.ts`, `permissions.ts` | Pages call `requireSession()` / `requireRole()`. Server Actions call `requireCapability("…")`. Roles: `super_admin > admin > manager > contributor > viewer`. |
| Authorisation | `supabase/migrations/*_security.sql` | Row-level security is the real gate; the UI only hides what RLS would refuse. Use the **user's** client (`session.supabase`) for reads/writes. `createAdminClient()` bypasses RLS — only after a capability check, never for ordinary CRUD. |
| Server Actions | `src/lib/actions.ts` | Every action: `return run(async () => { … })` → `ActionResult<T>`. Validate with zod + the `f.*` field schemas. Wrap Supabase calls in `check()` (or `one()` for `.single()`). Throw `ActionError("friendly message")`. Never leak raw DB errors. |
| Alerts | `src/lib/events.ts` | **Every mutation calls `recordEvent()`** — it writes the audit log, fans out in-app notifications, sends the branded Resend email and web push. `summary` is a sentence fragment that follows the actor's name (`moved “Brochure” to In progress`). Pick the right `category` from `src/lib/notifications.ts`. Use `include: [userId]` for people personally affected, `importance: "high"` for things that matter (confirmed, failed, completed), `"low"` for small edits. |
| After a mutation | — | `revalidatePath("/", "layout")` (sidebar badges + overview read most tables). |
| Client mutations | `src/components/shared/use-action.ts` | `const [save, saving] = useAction(action, { success: "Saved", onSuccess })` — handles pending state, toasts and `router.refresh()`. |
| Live data | `src/lib/hooks/use-realtime-refresh.ts` | Call `useRealtimeRefresh(["table"])` in each module's top client component. |
| Client permissions | `useViewer()` from `src/components/shell/session-context.tsx` | `const { viewer, can } = useViewer(); can("records.write")`. |
| Status vocabularies | `src/lib/domain.ts` | Label + tone + icon + chart colour for every enum. Status is never shown by colour alone: always `<Badge tone icon>` or `<StatusMenu>`. |
| Dates & numbers | `src/lib/utils.ts` | Always `formatDate`, `formatDateTime`, `relativeDay`, `timeAgo`, `formatMoney`, `isoDay()` — they pin the Accra timezone so server and client render identically. Never `toLocaleDateString()`. |
| Settings | `src/lib/settings.ts` | `getSettings()` / `saveSetting()`; event facts live in `app_settings`, not in code. |
| Email | `src/lib/email/templates.ts`, `send.ts` | Hand-built table HTML (React Email is deprecated). Without `RESEND_API_KEY` mail is logged to `email_log` as `skipped`, with its HTML, instead of sent. |

## UI conventions

- Design tokens are Tailwind v4 theme colours defined in `src/app/globals.css`: `bg-surface`, `bg-surface-2/3`, `border-line`, `text-ink`, `text-ink-2`, `text-ink-3`, `bg-primary`, `bg-accent`, `text-accent-ink`, `bg-accent-soft`, status families `good|warning|serious|critical|neutral|gold` each with `-soft` and `-ink`. **Never hard-code hex colours in components** (the navy hero/sidebar are the only exceptions). Both themes must work: check `.dark`.
- Use the kit in `src/components/ui/*`: `Button`, `Input/Select/Textarea/Field/Checkbox/Switch`, `Badge`, `Card/CardHeader/CardBody`, `Dialog/DialogContent/SheetContent/ConfirmDialog`, `DropdownMenu*`, `Popover*`, `Tabs*`, `Segmented`, `Tooltip`, `Avatar`, `PageHeader`, `EmptyState`, `Meter`, `FilterChip`, `Skeleton`. Shared: `StatusMenu`, `Comments`.
- A module = `src/app/(app)/<module>/page.tsx` (Server Component: loads data with `session.supabase`, passes plain props) + `actions.ts` (`"use server"`) + `src/components/<module>/*` (client). **`src/components/deliverables/*` is the reference implementation — mirror its structure, density and tone.**
- Filters, the open record (`?item=<id>`) and "new" dialogs (`?new=1`) live in the URL so views are shareable and the command palette / notifications can deep-link.
- Responsive is non-negotiable: real `<table>` from `md:` up, stacked cards below; horizontal chip rows scroll on phones (`scroll-none -mx-4 px-4`); dialogs become bottom sheets automatically. Minimum touch target 36px. Test at 390px wide.
- Accessibility: every input has a `<label>` (use `Field`), icon-only buttons have `aria-label`, decorative icons `aria-hidden`.
- Radix `asChild` children must be created in a Client Component (elements created in a Server Component arrive lazy and Slot rejects them).
- Charts follow `src/components/charts/*`: thin marks, 2px surface gaps, legend + table twin, text in ink tokens — never in series colours.
- Copy: plain, specific, British spelling, sentence case. No lorem ipsum, no invented data: if something isn't known, show an empty state.

## Do not

- Do not edit `src/lib/**`, `src/components/ui/**`, `src/components/shell/**`, `src/app/globals.css` or existing migrations from inside a feature module without a very good reason; add to them only when a helper is genuinely shared.
- Do not run `supabase db reset` casually — it wipes local users.
- Do not add dependencies without need; everything required is installed.
