-- Estado global do worker (ex: offset do getUpdates do bot Telegram — 1 bot serve todos os usuários)
create table if not exists public.app_state (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

grant all on public.app_state to service_role;
grant usage on schema public to service_role;
