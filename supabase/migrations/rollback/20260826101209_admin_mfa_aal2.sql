create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

comment on function public.is_admin() is
  'Retorna true para profile admin autenticado; rollback sem exigencia AAL2.';
