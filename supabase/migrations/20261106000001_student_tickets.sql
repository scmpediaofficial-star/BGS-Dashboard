-- ════════════════════════════════════════════════════════════════════════════
--  BGS Dashboard · 13 · Complimentary student tickets
--
--  • A fourth kind of ticket, 'student': complimentary, named, and tied to the
--    institution the student belongs to (so the e-ticket can say "Student ·
--    UPSA Graduate School" and carry that institution's logo).
--  • Students collect their own ticket on the public /student-ticket page with
--    the unique ticket code. Before they can download it they must give their
--    programme, email and phone. The columns below record who has done that and
--    who has downloaded, so every student is accounted for.
--  • A student number can only be on one live ticket per institution.
--  • UPSA Graduate School is added to the institutions list (upload its logo on
--    the Institutions page).
--
--  The student list itself is NOT in this file: names and numbers are personal
--  data and this repository is public. Add students from Tickets ▸ Students
--  (one at a time or by pasting a list).
--
--  Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.tickets drop constraint if exists tickets_kind_check;
alter table public.tickets add constraint tickets_kind_check check (kind in ('paid', 'delegate', 'complimentary', 'student'));

alter table public.tickets
  add column if not exists student_number       text,
  add column if not exists programme            text,
  add column if not exists details_completed_at timestamptz,
  add column if not exists first_downloaded_at  timestamptz,
  add column if not exists download_count       integer not null default 0;

create unique index if not exists tickets_student_number_key
  on public.tickets (institution_id, lower(student_number))
  where kind = 'student' and status <> 'void' and student_number is not null;

-- Row-level security is unchanged: managers and above write, everyone signed in
-- reads. Students never touch the table directly; the public page goes through
-- server actions that look a ticket up by its code.

insert into public.institutions (name, short_name)
select 'UPSA Graduate School', 'UPSA'
where not exists (
  select 1 from public.institutions
  where lower(name) like '%upsa%' or lower(name) like '%university of professional studies%'
);
