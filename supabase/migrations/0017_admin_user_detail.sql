-- Admin user-detail page needs email (not exposed via client API) plus balance,
-- joined in one call. Gated by the same is_admin() check as admin_list_wallets().
create function public.admin_get_user(p_user_id uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  is_admin boolean,
  balance integer,
  created_at timestamptz
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
  select u.id, u.email::text, p.display_name, coalesce(p.is_admin, false), coalesce(pb.balance, 0), u.created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.points_balances pb on pb.user_id = u.id
  where u.id = p_user_id;
end;
$$;

revoke all on function public.admin_get_user(uuid) from public;
grant execute on function public.admin_get_user(uuid) to authenticated;
