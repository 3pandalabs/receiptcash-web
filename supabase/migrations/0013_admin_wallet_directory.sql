-- Wallets admin page needs email/display_name, but auth.users isn't exposed
-- via the client API. A SECURITY DEFINER function lets admins read just the
-- columns they need, gated by the same is_admin() check used elsewhere.
create function public.admin_list_wallets()
returns table (
  user_id uuid,
  email text,
  display_name text,
  balance integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select pb.user_id, u.email::text, p.display_name, pb.balance, pb.updated_at
  from public.points_balances pb
  join auth.users u on u.id = pb.user_id
  left join public.profiles p on p.id = pb.user_id
  order by pb.balance desc;
end;
$$;

revoke all on function public.admin_list_wallets() from public;
grant execute on function public.admin_list_wallets() to authenticated;
