-- ════════════════════════════════════════════════════════════════════════════
--  BGS Dashboard · 11 · Institutions
--
--  Bodies that pay for their members outside Paystack (bar associations,
--  institutes, companies). Each member is an ordinary ticket sale that
--  remembers which institution paid, so tickets, Paystack customer codes
--  and the money totals all stay in the one ledger.
--
--  Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.institutions (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  contact_person  text,
  email           text,
  phone           text,
  fee             numeric(12,2),   -- per ticket; null = the "fee outside Paystack" setting
  notes           text,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists institutions_name_key on public.institutions (lower(trim(name)));

drop trigger if exists institutions_touch on public.institutions;
create trigger institutions_touch before update on public.institutions
  for each row execute function public.touch_updated_at();

alter table public.ticket_sales add column if not exists institution_id uuid references public.institutions (id) on delete set null;
create index if not exists ticket_sales_institution_idx on public.ticket_sales (institution_id);

-- ── Security: everyone reads, managers and above write (as for ticket sales) ─
alter table public.institutions enable row level security;
drop policy if exists "institutions: read"  on public.institutions;
drop policy if exists "institutions: write" on public.institutions;
create policy "institutions: read"  on public.institutions for select to authenticated using ((select public.has_role('viewer')));
create policy "institutions: write" on public.institutions for all    to authenticated using ((select public.has_role('manager'))) with check ((select public.has_role('manager')));

do $$
begin
  alter publication supabase_realtime add table public.institutions;
exception when duplicate_object then null;
end $$;
