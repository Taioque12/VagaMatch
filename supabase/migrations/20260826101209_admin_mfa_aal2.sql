-- O painel administrativo exige uma sessao com segundo fator confirmado.
-- A verificacao continua vinculada ao user_id e ao role protegido no profile.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'admin'
    );
$$;

revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

comment on function public.is_admin() is
  'Retorna true somente para profile admin com sessao MFA AAL2.';
