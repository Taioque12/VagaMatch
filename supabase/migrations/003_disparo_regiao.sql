-- Modo de disparo (manual via bot vs automático no cron) e modo de região (minha região c/ raio vs Brasil todo)

alter table public.preferencias
  add column if not exists modo_regiao text not null default 'minha_regiao'
    check (modo_regiao in ('minha_regiao', 'brasil')),
  add column if not exists raio_km int not null default 50,
  add column if not exists disparo_manual boolean not null default false,
  add column if not exists busca_solicitada boolean not null default false;

comment on column public.preferencias.modo_regiao is 'minha_regiao: usa regioes[] + raio_km via Adzuna distance. brasil: ignora regiao, busca nacional.';
comment on column public.preferencias.disparo_manual is 'true: worker só processa esse usuário quando busca_solicitada=true (via comando /buscar no bot). false: roda todo ciclo do cron.';
comment on column public.preferencias.busca_solicitada is 'setado true pelo bot ao receber /buscar; o worker zera depois de processar.';
