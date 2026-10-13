-- ════════════════════════════════════════════════════════════════════════════
--  BGS Dashboard · 12 · Institution logos and attendance certificates
--
--  • institutions gain a logo (printed on their members' certificates) and a
--    short name (how members write the institution in "organisation").
--  • tickets can be tied to an institution directly. That is what puts the
--    logo on a certificate for someone who paid through Paystack, where the
--    sale itself must stay outside the institution-paid money totals.
--  • The four institutions we hold logos for are added (or, when already in the
--    list, given their logo). Their logos ship with the app in
--    public/brand/institutions/.
--
--  Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.institutions
  add column if not exists short_name text,
  add column if not exists logo_url   text;

alter table public.tickets add column if not exists institution_id uuid references public.institutions (id) on delete set null;
create index if not exists tickets_institution_idx on public.tickets (institution_id) where institution_id is not null;

-- ── The institutions we hold logos for ──────────────────────────────────────
do $$
declare
  item record;
  found uuid;
begin
  for item in
    select * from (values
      ('Institute of Directors Ghana',                'IoD Ghana', '/brand/institutions/iod-ghana.png',            array['institute of directors%', 'iod%']),
      ('Institute of Chartered Accountants, Ghana',   'ICAG',      '/brand/institutions/icag.png',                 array['institute of chartered accountants%', 'icag%']),
      ('Ghana Bar Association',                       'GBA',       '/brand/institutions/ghana-bar-association.png', array['ghana bar association%', 'gba%']),
      ('Ghana Institution of Engineering',            'GhIE',      '/brand/institutions/ghie.png',                 array['ghana institution of engineer%', 'ghie%'])
    ) as t (name, short_name, logo, patterns)
  loop
    select id into found from public.institutions where lower(trim(name)) like any (item.patterns) order by created_at limit 1;
    if found is null then
      insert into public.institutions (name, short_name, logo_url) values (item.name, item.short_name, item.logo);
    else
      -- Keep a name or logo someone has already set; only fill the gaps.
      update public.institutions set short_name = coalesce(short_name, item.short_name), logo_url = coalesce(logo_url, item.logo) where id = found;
    end if;
  end loop;
end $$;
