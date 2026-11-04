-- =====================================================================
-- CRM Carpa Diem · 25 · Recordatorios de leads
--
--   · reunion_at: si se agenda una reunión con el lead, sale en Inicio la semana antes.
--   · seguimiento_desde: último avance (alta, cambio de estado, reunión o «seguimos en
--     contacto»). Si pasa una semana sin avances, Inicio recuerda preguntar si sigue
--     adelante o se ha caído.
-- =====================================================================

alter table public.leads
  add column reunion_at timestamptz,
  add column seguimiento_desde timestamptz;
update public.leads set seguimiento_desde = updated_at;
alter table public.leads alter column seguimiento_desde set default now();

create function public.lead_seguimiento() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.seguimiento_desde := now();
  elsif new.estado is distinct from old.estado or new.reunion_at is distinct from old.reunion_at then
    new.seguimiento_desde := now();
  end if;
  return new;
end;
$$;
create trigger lead_seguimiento before insert or update of estado, reunion_at on public.leads
  for each row execute function public.lead_seguimiento();
