-- Remove acesso HTTP/RPC de funcoes SECURITY DEFINER que existem apenas para
-- triggers ou verificacoes internas. Triggers nao dependem de EXECUTE do cliente.
revoke all on function public.gerar_codigo_indicacao() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_curriculo_system_columns() from public, anon, authenticated;
revoke all on function public.protect_preferencias_quota_columns() from public, anon, authenticated;
revoke all on function public.protect_profile_privileged_columns() from public, anon, authenticated;
revoke all on function public.protect_profile_telegram_chat_id() from public, anon, authenticated;
revoke all on function public.protect_vaga_privileged_columns() from public, anon, authenticated;

-- Estas duas funcoes compoem fluxos autenticados deliberados.
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

revoke all on function public.registrar_indicacao(text) from public, anon, authenticated;
grant execute on function public.registrar_indicacao(text) to authenticated;

-- Garante que as politicas administrativas existam e sejam avaliadas somente
-- para usuarios autenticados. A coluna role e protegida por trigger.
drop policy if exists "admin ve todos os perfis" on public.profiles;
create policy "admin ve todos os perfis"
  on public.profiles for select to authenticated
  using (public.is_admin());

drop policy if exists "admin ve todas as preferencias" on public.preferencias;
create policy "admin ve todas as preferencias"
  on public.preferencias for select to authenticated
  using (public.is_admin());

drop policy if exists "admin ve todas as vagas" on public.vagas_vistas;
create policy "admin ve todas as vagas"
  on public.vagas_vistas for select to authenticated
  using (public.is_admin());

;
