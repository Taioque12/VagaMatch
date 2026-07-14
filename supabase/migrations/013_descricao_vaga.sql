-- Persiste a descrição da vaga para uso on-demand (currículo ajustado e
-- entrevista simulada geram prompt com a descrição; sem ela a IA trabalha às cegas).
alter table public.vagas_vistas add column if not exists descricao text;
