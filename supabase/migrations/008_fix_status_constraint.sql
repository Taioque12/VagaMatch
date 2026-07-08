-- Remove a constraint antiga
alter table public.vagas_vistas drop constraint if exists vagas_vistas_status_check;

-- Adiciona a constraint nova incluindo 'pendente_processamento'
alter table public.vagas_vistas
  add constraint vagas_vistas_status_check
  check (status in ('descoberta', 'pendente_processamento', 'notificada', 'candidatado', 'descartada', 'erro'));
