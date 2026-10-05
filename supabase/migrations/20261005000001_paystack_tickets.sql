-- ════════════════════════════════════════════════════════════════════════════
--  BGS Dashboard · 08 · Paystack, admission tickets and the new summit date
--
--  • ticket_sales learn which Paystack transaction and customer they came from.
--  • tickets: one row per person admitted — paid ticket holders, delegates
--    (chairperson, panel members, moderators …) and complimentary tickets.
--    Every ticket carries a unique code that is printed on its e-ticket.
--  • Tickets follow sales automatically: a paid sale for 3 has 3 valid tickets,
--    a refunded one has none. The trigger does it, so the dashboard, the
--    Paystack sync and the SQL editor can never disagree.
--  • The summit moves from 7 October to 12 November 2026.
--
--  Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Sales ⇄ Paystack ────────────────────────────────────────────────────────
alter table public.ticket_sales
  add column if not exists paystack_id            bigint,
  add column if not exists paystack_customer_code text;

-- One sale per Paystack transaction, however many times the sync, the webhook
-- and the scheduler see it. (Manual sales leave it null; nulls never collide.)
create unique index if not exists ticket_sales_paystack_id_key on public.ticket_sales (paystack_id);
create index if not exists ticket_sales_reference_idx on public.ticket_sales (reference) where reference is not null;

-- ── Ticket codes ────────────────────────────────────────────────────────────
-- BGS-XXXX-XXXX from 31 characters with no look-alikes (no 0/O, 1/I/L).
create or replace function public.new_ticket_code()
returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := gen_random_bytes(8);
  code text := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
  end loop;
  return 'BGS-' || substr(code, 1, 4) || '-' || substr(code, 5, 4);
end $$;

-- ── Tickets ─────────────────────────────────────────────────────────────────
create table if not exists public.tickets (
  id             uuid primary key default gen_random_uuid(),
  seq            bigint generated always as identity,
  code           text not null unique default public.new_ticket_code(),
  kind           text not null check (kind in ('paid', 'delegate', 'complimentary')),
  status         text not null default 'valid' check (status in ('valid', 'checked_in', 'void')),
  holder_name    text,
  holder_email   text,
  holder_phone   text,
  organization   text,
  role_label     text,
  sale_id        uuid references public.ticket_sales (id) on delete cascade,
  panelist_id    uuid unique references public.panelists (id) on delete set null,
  notes          text,
  checked_in_at  timestamptz,
  issued_by      uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists tickets_kind_idx on public.tickets (kind, status);
create index if not exists tickets_sale_idx on public.tickets (sale_id);

drop trigger if exists tickets_touch on public.tickets;
create trigger tickets_touch before update on public.tickets
  for each row execute function public.touch_updated_at();

-- Stamp / clear the check-in time with the status, like deliverables do.
create or replace function public.sync_ticket_check_in()
returns trigger language plpgsql as $$
begin
  if new.status = 'checked_in' and (tg_op = 'INSERT' or old.status is distinct from 'checked_in') then
    new.checked_in_at := coalesce(new.checked_in_at, now());
  elsif new.status <> 'checked_in' then
    new.checked_in_at := null;
  end if;
  return new;
end $$;

drop trigger if exists tickets_check_in on public.tickets;
create trigger tickets_check_in before insert or update of status on public.tickets
  for each row execute function public.sync_ticket_check_in();

-- ── Tickets follow sales ────────────────────────────────────────────────────
create or replace function public.sync_sale_tickets()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ticket_kind text;
  live int;
  revived int := 0;
begin
  -- Online (Zoom) passes are admitted with their access code, not a door ticket.
  if exists (select 1 from public.ticket_types t where t.id = new.ticket_type_id and t.is_virtual) then
    update public.tickets set status = 'void' where sale_id = new.id and status = 'valid';
    return null;
  end if;

  if new.payment_status not in ('paid', 'complimentary') then
    update public.tickets set status = 'void' where sale_id = new.id and status = 'valid';
    return null;
  end if;

  ticket_kind := case when new.payment_status = 'complimentary' then 'complimentary' else 'paid' end;
  select count(*) into live from public.tickets where sale_id = new.id and status <> 'void';

  if live < new.quantity then
    -- Bring back tickets voided earlier before printing new codes, so a
    -- reversed refund hands people the ticket they already hold.
    update public.tickets set status = 'valid'
      where id in (select id from public.tickets where sale_id = new.id and status = 'void' order by seq limit new.quantity - live);
    get diagnostics revived = row_count;
    insert into public.tickets (kind, sale_id, holder_name, holder_email, holder_phone, organization, issued_by)
      select ticket_kind, new.id, new.buyer_name, new.buyer_email, new.buyer_phone, new.organization, new.recorded_by
      from generate_series(1, new.quantity - live - revived);
  elsif live > new.quantity then
    -- Newest first, and never a ticket that has already been used at the door.
    update public.tickets set status = 'void'
      where id in (select id from public.tickets where sale_id = new.id and status = 'valid' order by seq desc limit live - new.quantity);
  end if;

  update public.tickets set kind = ticket_kind where sale_id = new.id and kind <> ticket_kind;

  -- Buyer details corrected on the sale carry over to tickets nobody has renamed.
  if tg_op = 'UPDATE' then
    update public.tickets set holder_name = new.buyer_name
      where sale_id = new.id and holder_name is not distinct from old.buyer_name and new.buyer_name is distinct from old.buyer_name;
    update public.tickets set holder_email = new.buyer_email
      where sale_id = new.id and holder_email is not distinct from old.buyer_email and new.buyer_email is distinct from old.buyer_email;
    update public.tickets set holder_phone = new.buyer_phone
      where sale_id = new.id and holder_phone is not distinct from old.buyer_phone and new.buyer_phone is distinct from old.buyer_phone;
    update public.tickets set organization = new.organization
      where sale_id = new.id and organization is not distinct from old.organization and new.organization is distinct from old.organization;
  end if;
  return null;
end $$;

drop trigger if exists ticket_sales_tickets on public.ticket_sales;
create trigger ticket_sales_tickets
  after insert or update of payment_status, quantity, ticket_type_id, buyer_name, buyer_email, buyer_phone, organization on public.ticket_sales
  for each row execute function public.sync_sale_tickets();

-- Sales recorded before this migration get their tickets now.
insert into public.tickets (kind, sale_id, holder_name, holder_email, holder_phone, organization, issued_by)
select case when s.payment_status = 'complimentary' then 'complimentary' else 'paid' end,
       s.id, s.buyer_name, s.buyer_email, s.buyer_phone, s.organization, s.recorded_by
from public.ticket_sales s
join public.ticket_types t on t.id = s.ticket_type_id and not t.is_virtual
cross join lateral generate_series(1, s.quantity - (select count(*)::int from public.tickets k where k.sale_id = s.id and k.status <> 'void'))
where s.payment_status in ('paid', 'complimentary');

-- ── Security: same ladder as ticket sales ───────────────────────────────────
alter table public.tickets enable row level security;
drop policy if exists "tickets: read" on public.tickets;
drop policy if exists "tickets: write" on public.tickets;
create policy "tickets: read"  on public.tickets for select to authenticated using ((select public.has_role('viewer')));
create policy "tickets: write" on public.tickets for all    to authenticated using ((select public.has_role('manager'))) with check ((select public.has_role('manager')));

do $$
begin
  alter publication supabase_realtime add table public.tickets;
exception when duplicate_object then null;
end $$;

-- ── The summit is now on 12 November 2026 ───────────────────────────────────
update public.app_settings
   set value = jsonb_set(value, '{starts_at}', '"2026-11-12T08:00:00+00:00"'::jsonb), updated_at = now()
 where key = 'event' and value ->> 'starts_at' like '2026-10-07%';

update public.social_templates
   set content = replace(content, '7 October 2026', '12 November 2026')
 where content like '%7 October 2026%';

-- Work that was due on the day itself moves with the day.
update public.deliverables
   set due_date = date '2026-11-12'
 where due_date = date '2026-10-07' and status <> 'completed';
