-- Adiciona coluna para armazenar o motivo gerado pela IA no match
alter table public.vagas_vistas add column if not exists motivo_ia text;
