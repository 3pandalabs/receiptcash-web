-- Capture display_name from signup metadata (set by the client's signUp options.data),
-- falling back to the email's local part when no name was provided.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Backfill existing profiles that have no display_name yet.
update public.profiles p
set display_name = split_part(u.email, '@', 1)
from auth.users u
where u.id = p.id
  and (p.display_name is null or trim(p.display_name) = '');
