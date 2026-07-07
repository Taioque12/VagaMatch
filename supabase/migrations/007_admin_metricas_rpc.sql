-- Admin.jsx hoje baixa TODAS as linhas de profiles/preferencias/vagas_vistas pro navegador só
-- pra contar/agrupar no cliente — não escala (cresce linear com o total de vagas do sistema
-- inteiro, não por usuário). admin_metricas() agrega tudo no Postgres e retorna só o resultado.
create or replace function public.admin_metricas()
returns json
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.';
  end if;

  return (
    select json_build_object(
      'totalUsuarios', (select count(*) from public.profiles),
      'buscaAtiva', (select count(*) from public.preferencias where ativo),
      'disparoManual', (select count(*) from public.preferencias where disparo_manual),
      'cadastrosUltimos7Dias', (
        select count(*) from public.profiles where created_at >= now() - interval '7 days'
      ),
      'vagasNotificadas7Dias', (
        select count(*) from public.vagas_vistas
        where status = 'notificada' and data_encontrada >= now() - interval '7 days'
      ),
      'vagasComErro', (select count(*) from public.vagas_vistas where status = 'erro'),
      'porAssinatura', (
        select coalesce(json_object_agg(coalesce(assinatura_status, 'gratis'), qtd), '{}'::json)
        from (
          select assinatura_status, count(*) qtd from public.profiles group by assinatura_status
        ) t
      ),
      'porRecorrencia', (
        select coalesce(json_object_agg(coalesce(assinatura_recorrencia, 'sem_recorrencia'), qtd), '{}'::json)
        from (
          select assinatura_recorrencia, count(*) qtd from public.profiles group by assinatura_recorrencia
        ) t
      )
    )
  );
end;
$$;

revoke all on function public.admin_metricas() from public;
grant execute on function public.admin_metricas() to authenticated;
