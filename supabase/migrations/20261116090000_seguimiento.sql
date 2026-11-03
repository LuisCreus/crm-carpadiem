-- =====================================================================
-- CRM Carpa Diem · 19 · Seguimiento de presupuestos desde su creación
--
--   · seguimiento_desde: cuándo se creó el presupuesto, cambió de estado o se
--     hizo el último seguimiento. Si pasa una semana (Ajustes → días de
--     seguimiento) sin cambios, en Inicio sale un recordatorio.
--   · Solo para los presupuestos nuevos: los que ya existían se quedan sin fecha
--     (siguen con el aviso de siempre: enviado hace una semana y sin respuesta).
-- =====================================================================

alter table public.presupuestos add column seguimiento_desde timestamptz;

create function public.presupuesto_seguimiento() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.seguimiento_desde := now();
  elsif new.estado is distinct from old.estado and old.seguimiento_desde is not null then
    new.seguimiento_desde := now();
  end if;
  return new;
end;
$$;
create trigger presupuesto_seguimiento before insert or update of estado on public.presupuestos
  for each row execute function public.presupuesto_seguimiento();
