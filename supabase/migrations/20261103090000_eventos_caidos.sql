-- =====================================================================
-- CRM Carpa Diem · 9 · Eventos que se caen
--
--   · Nuevo estado de presupuesto "Caído": estaba aceptado (o casi) y se cae.
--   · Desde el evento: "Se ha caído" (con o sin quedarnos lo cobrado),
--     "Lo aceptamos por error" (vuelve a Pendiente) y "Reactivar".
-- =====================================================================

alter type public.estado_presupuesto add value if not exists 'caido' after 'rechazado';

-- Se ha caído: el presupuesto pasa a Caído y el evento se cancela.
-- Con p_retener, Carpa Diem se queda lo cobrado (Cancelado – reserva retenida).
create function public.evento_caido(p_evento uuid, p_retener boolean default false, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_e public.eventos;
  v_cobrado numeric := 0;
begin
  if not public.es_usuario_activo() then
    raise exception 'Sin permiso';
  end if;
  select * into v_e from public.eventos where id = p_evento and deleted_at is null for update;
  if not found then
    raise exception 'Evento no encontrado';
  end if;
  if v_e.presupuesto_id is not null then
    update public.presupuestos
       set estado = 'caido', motivo_rechazo = coalesce(nullif(trim(p_motivo), ''), 'Se cayó')
     where id = v_e.presupuesto_id;
    select coalesce(sum(importe), 0) into v_cobrado
      from public.cobros where presupuesto_id = v_e.presupuesto_id and deleted_at is null;
  end if;
  if p_retener and v_cobrado > 0 then
    update public.eventos set estado = 'cancelado_reserva_retenida', importe_retenido = v_cobrado where id = p_evento;
  else
    update public.eventos set estado = 'cancelado', importe_retenido = null where id = p_evento;
  end if;
end;
$$;

-- Lo aceptamos por error: el presupuesto vuelve a Pendiente y el evento desaparece
create function public.evento_por_error(p_evento uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.eventos;
begin
  if not public.es_usuario_activo() then
    raise exception 'Sin permiso';
  end if;
  select * into v_e from public.eventos where id = p_evento and deleted_at is null for update;
  if not found then
    raise exception 'Evento no encontrado';
  end if;
  if exists (select 1 from public.facturas where evento_id = p_evento and deleted_at is null and estado <> 'prevista') then
    raise exception 'Este evento ya tiene facturas emitidas: márcalo como caído';
  end if;
  if v_e.presupuesto_id is not null then
    update public.presupuestos set estado = 'pendiente' where id = v_e.presupuesto_id;
  end if;
  update public.eventos set estado = 'cancelado', deleted_at = now(), deleted_by = auth.uid() where id = p_evento;
end;
$$;

-- Reactivar un evento cancelado o caído (vuelve a Aceptado y a la Planificación)
create function public.evento_reactivar(p_evento uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.eventos;
begin
  if not public.es_usuario_activo() then
    raise exception 'Sin permiso';
  end if;
  select * into v_e from public.eventos where id = p_evento and deleted_at is null;
  if not found then
    raise exception 'Evento no encontrado';
  end if;
  if v_e.presupuesto_id is not null then
    perform public.aceptar_presupuesto(v_e.presupuesto_id, v_e.modalidad);
  end if;
  update public.eventos set estado = 'activo', importe_retenido = null where id = p_evento;
end;
$$;

revoke execute on function public.evento_caido(uuid, boolean, text), public.evento_por_error(uuid),
  public.evento_reactivar(uuid) from public, anon;
grant execute on function public.evento_caido(uuid, boolean, text), public.evento_por_error(uuid),
  public.evento_reactivar(uuid) to authenticated;
