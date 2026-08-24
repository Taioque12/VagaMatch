-- Rollback manual da migration 027. Executar somente após interromper escritas
-- de embeddings e confirmar que o schema public pode receber a extensão.
alter extension vector set schema public;

alter function public.protect_curriculo_system_columns()
  set search_path = public;
alter function public.protect_vaga_privileged_columns()
  set search_path = public;
alter function public.match_vaga_curriculo(uuid, uuid)
  set search_path = public;
alter function public.ajuste_feedback_vetorial(uuid, uuid)
  set search_path = public;
