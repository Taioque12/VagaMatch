-- Filtro de salário mínimo desejado pelo usuário (opcional).
-- null = sem filtro (comportamento atual, não quebra usuários existentes).
alter table public.preferencias
  add column if not exists salario_minimo numeric;
