-- ════════════════════════════════════════════════════════════════════════════
--  BGS Dashboard · 07 · Base data
--  The essentials the app needs on a fresh database, using only facts that are
--  already public on boardroomgovsummit.com. Safe to run whether or not the
--  private planning seed (…03_seed.sql, kept out of version control) was loaded:
--  every statement skips rows that already exist.
-- ════════════════════════════════════════════════════════════════════════════

insert into public.workstreams (slug, name, description, color_slot, icon, sort_order) values
  ('creatives-digital',   'Creatives & Digital', 'Event artwork, print, branding and digital content.', 1, 'palette',   1),
  ('event-management',    'Event Management',    'Venue, staging, logistics and on-site experience.',   2, 'building',  2),
  ('pr-media',            'PR & Media',          'Jingles, stories, coverage and media partnerships.',  3, 'megaphone', 3),
  ('client-deliverables', 'Client Deliverables', 'Inputs owed by the client and partners.',             4, 'handshake', 4)
on conflict (slug) do nothing;

insert into public.app_settings (key, value) values
  ('event', '{"name":"Boardroom Governance Summit 2026","short_name":"BGS 2026","theme":"Board Committees: From Oversight to Impact","tagline":"Shaping accountability in the boardrooms","starts_at":"2026-10-07T08:00:00+00:00","venue":"Labadi Beach Hotel","city":"Accra, Ghana","convener":"Prof. Douglas Boateng","website":"https://boardroomgovsummit.com","email":"info@boardroomgovsummit.com","phone":"+233 (0)53 145 1470"}'::jsonb),
  ('social_queue', '{"timezone":"Africa/Accra","slots":["08:30","12:30","17:30"],"days":[1,2,3,4,5,6,0]}'::jsonb)
on conflict (key) do nothing;

insert into public.ticket_types (name, description, price, currency, is_virtual, sort_order)
select * from (values
  ('Single Ticket — In person', 'Boardroom Governance Summit 2026 at Labadi Beach Hotel, Accra.', 2500.00::numeric, 'GHS', false, 10),
  ('Virtual Access — Zoom', 'Regional participants joining online. Unique access code per paid participant. Set the price under Tickets.', null::numeric, 'GHS', true, 20)
) as t(name, description, price, currency, is_virtual, sort_order)
where not exists (select 1 from public.ticket_types);

insert into public.social_hashtag_groups (name, hashtags)
select * from (values
  ('BGS core', '#BGS2026 #BoardroomGovernanceSummit #CorporateGovernance #Accra'),
  ('Leadership & boards', '#BoardLeadership #Directors #Accountability #BoardCommittees'),
  ('ESG & finance', '#ESG #AuditCommittee #Sustainability #RiskManagement')
) as t(name, hashtags)
where not exists (select 1 from public.social_hashtag_groups);

insert into public.social_templates (name, content)
select * from (values
  ('Panelist announcement', E'We are honoured to welcome {{name}}, {{title}} at {{organization}}, to the {{event}} stage.\n\n📅 7 October 2026\n📍 Labadi Beach Hotel, Accra\n🎟 boardroomgovsummit.com\n\n#BGS2026 #CorporateGovernance'),
  ('Countdown', E'{{days}} days to {{event}}.\n\nTheme: Board Committees — From Oversight to Impact.\n\nSecure your seat: boardroomgovsummit.com\n\n#BGS2026 #BoardroomGovernanceSummit'),
  ('Sponsor thank-you', E'Thank you to {{organization}} for partnering with {{event}} — shaping accountability in the boardrooms.\n\n#BGS2026 #Partnership')
) as t(name, content)
where not exists (select 1 from public.social_templates);
