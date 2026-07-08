alter table public.preferencias alter column raio_km set default 500;
update public.preferencias set raio_km = 500 where raio_km = 50;
