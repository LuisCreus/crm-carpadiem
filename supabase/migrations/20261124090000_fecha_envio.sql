-- =====================================================================
-- CRM Carpa Diem · 24 · Marcar como enviado con el día del envío
--
--   · «Marcar como enviado» admite la fecha en que se envió (por defecto, hoy;
--     nunca una fecha futura).
--   · El recordatorio de seguimiento (Ajustes → días de seguimiento) cuenta
--     desde el día del envío, no desde el día en que se marca.
-- =====================================================================

drop function public.marcar_enviado(uuid, int);

create function public.marcar_enviado(p_id uuid, p_version int, p_fecha date default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_lead uuid;
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_cuando timestamptz;
begin
  if not public.es_usuario_activo() then
    raise exception 'Sin permiso';
  end if;
  if p_fecha > v_hoy then
    raise exception 'La fecha de envío no puede ser posterior a hoy';
  end if;
  -- Hoy: el momento exacto. Un día anterior: ese día a mediodía (hora de Madrid).
  v_cuando := case when p_fecha is null or p_fecha = v_hoy then now()
                   else (p_fecha + time '12:00') at time zone 'Europe/Madrid' end;

  update public.presupuestos
     set enviado_at = v_cuando,
         version_enviada = p_version,
         estado = case when estado = 'borrador' then 'pendiente'::public.estado_presupuesto else estado end
   where id = p_id and deleted_at is null
  returning lead_id into v_lead;
  if not found then
    raise exception 'Presupuesto no encontrado';
  end if;

  update public.presupuesto_versiones set enviado_at = v_cuando
   where presupuesto_id = p_id and version = p_version;

  if v_lead is not null then
    update public.leads set estado = 'presupuesto_enviado'
     where id = v_lead and deleted_at is null
       and estado in ('por_contactar', 'contactado', 'interesado');
  end if;
end;
$$;
revoke execute on function public.marcar_enviado(uuid, int, date) from public, anon;
grant execute on function public.marcar_enviado(uuid, int, date) to authenticated;

-- Seguimiento: al marcarlo como enviado, la semana cuenta desde el día del envío.
-- (En los demás cambios de estado, desde el momento del cambio, como hasta ahora.)
create or replace function public.presupuesto_seguimiento() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.seguimiento_desde := now();
  elsif old.seguimiento_desde is not null
        and (new.estado is distinct from old.estado or new.enviado_at is distinct from old.enviado_at) then
    new.seguimiento_desde := case
      when new.enviado_at is not null and new.enviado_at is distinct from old.enviado_at then least(new.enviado_at, now())
      else now() end;
  end if;
  return new;
end;
$$;
