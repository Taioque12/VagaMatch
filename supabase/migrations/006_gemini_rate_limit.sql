-- Limite diário de gerações de IA por usuário (gerador de CV/carta + extração de PDF).
-- Sem isso, um usuário autenticado pode chamar a Edge Function `gemini` em loop e gerar
-- custo ilimitado na conta do Google. registrar_uso_gemini() faz check+incremento atômico
-- (evita race condition de duas requisições simultâneas lendo a mesma contagem "antiga").
create table if not exists public.gemini_uso_diario (
  user_id uuid not null references auth.users (id) on delete cascade,
  dia date not null default current_date,
  quantidade int not null default 0,
  primary key (user_id, dia)
);

alter table public.gemini_uso_diario enable row level security;

create policy "usuario ve o proprio uso de ia"
  on public.gemini_uso_diario for select
  using (auth.uid() = user_id);

grant select on public.gemini_uso_diario to authenticated;
grant all on public.gemini_uso_diario to service_role;

-- security definer + auth.uid() interno (não recebe user_id por parâmetro): mesmo que
-- chamada diretamente via RPC por um usuário autenticado, só afeta a própria contagem.
-- Retorna true se incrementou (dentro do limite), false se já tinha batido o limite hoje.
create or replace function public.registrar_uso_gemini(p_limite int)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  usado int;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;

  insert into public.gemini_uso_diario (user_id, dia, quantidade)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, dia) do update
    set quantidade = gemini_uso_diario.quantidade + 1
    where gemini_uso_diario.quantidade < p_limite
  returning quantidade into usado;

  return usado is not null;
end;
$$;

grant execute on function public.registrar_uso_gemini(int) to authenticated;
