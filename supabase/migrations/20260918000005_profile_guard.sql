-- Profile self-service may edit personal details, but access grants belong to
-- the server-side team workflow. RLS identifies rows, not changed columns.
create or replace function public.guard_profile_access_fields()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' and (
    new.id is distinct from old.id or
    new.email is distinct from old.email or
    new.role is distinct from old.role or
    new.is_active is distinct from old.is_active or
    new.invited_by is distinct from old.invited_by or
    new.invited_at is distinct from old.invited_at
  ) then
    raise exception 'Access fields can only be changed by the team administrator workflow.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger guard_profile_access_fields
before update on public.profiles
for each row execute function public.guard_profile_access_fields();
