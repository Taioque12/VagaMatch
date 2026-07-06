-- Role de admin (painel de saúde do projeto) + campos de assinatura (billing ainda manual,
-- sem gateway integrado — Fase 4 do ROADMAP).

alter table public.profiles
  add column if not exists role text not null default 'usuario' check (role in ('usuario', 'admin')),
  add column if not exists assinatura_status text not null default 'gratis'
    check (assinatura_status in ('gratis', 'ativa', 'cancelada', 'pendente')),
  add column if not exists assinatura_recorrencia text
    check (assinatura_recorrencia in ('mensal', 'anual')),
  add column if not exists assinatura_inicio timestamptz,
  add column if not exists assinatura_proxima_cobranca timestamptz;

comment on column public.profiles.role is 'usuario: acesso normal. admin: enxerga painel /admin com métricas de todos os usuários.';
comment on column public.profiles.assinatura_status is 'billing manual por enquanto — sem gateway integrado ainda.';

-- Função security definer: evita recursão de RLS ao checar se o usuário logado é admin.
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Admin enxerga todos os perfis, preferências e vagas (métricas de saúde do projeto).
create policy "admin ve todos os perfis"
  on public.profiles for select
  using (public.is_admin());

create policy "admin ve todas as preferencias"
  on public.preferencias for select
  using (public.is_admin());

create policy "admin ve todas as vagas"
  on public.vagas_vistas for select
  using (public.is_admin());

-- Promova manualmente o primeiro admin depois de rodar esta migration, ex:
-- update public.profiles set role = 'admin' where id = '<seu-user-id>';
