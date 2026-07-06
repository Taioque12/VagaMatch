-- A policy "usuario registra feedback na propria vaga" (001_schema.sql) permite UPDATE em
-- QUALQUER coluna da própria linha de vagas_vistas — RLS só restringe linhas, não colunas.
-- Na prática o único update feito pelo cliente autenticado é o campo `status` (Dashboard.jsx,
-- botões "Me candidatei"/"Descartar"). Sem essa restrição, um usuário autenticado poderia, via
-- supabase-js, sobrescrever `score`, `callback_id` (quebra o botão de feedback do Telegram
-- daquela vaga) ou `curriculo_gerado_path` das próprias vagas.
--
-- O worker (service_role) não é afetado: grants de coluna só valem pra authenticated/anon.
revoke update on public.vagas_vistas from authenticated;
grant update (status) on public.vagas_vistas to authenticated;
