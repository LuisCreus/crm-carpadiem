-- Arreglos tras la importación real
-- Aceptar un presupuesto sin tipo de evento daba error (es_larga_duracion quedaba en null)

create or replace function public.aceptar_presupuesto(p_id uuid, p_modalidad public.modalidad_evento default 'confirmado')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_p public.presupuestos;
  v_evento uuid;
begin
  if not public.es_usuario_activo() then
    raise exception 'Sin permiso';
  end if;
  select * into v_p from public.presupuestos where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Presupuesto no encontrado';
  end if;

  if v_p.estado not in ('aceptado', 'reserva_pagada', 'pagado') then
    update public.presupuestos set estado = 'aceptado' where id = p_id;
  end if;

  -- Las demás opciones de la misma oportunidad pasan a "Descartada"
  if v_p.oportunidad_id is not null then
    update public.presupuestos
       set estado = 'descartada'
     where oportunidad_id = v_p.oportunidad_id
       and id <> p_id
       and deleted_at is null
       and estado in ('borrador', 'pendiente', 'caducado');
  end if;

  insert into public.eventos (
    presupuesto_id, cliente_id, tipo_evento, intermediario_id, fecha_precision,
    fecha_inicio, fecha_fin, ubicacion, provincia, material, importe, modalidad,
    es_larga_duracion)
  values (
    v_p.id, v_p.cliente_id, v_p.tipo_evento, v_p.intermediario_id, v_p.fecha_precision,
    v_p.fecha_evento, v_p.fecha_fin, v_p.ubicacion, v_p.provincia, v_p.material, v_p.importe,
    p_modalidad, coalesce(v_p.tipo_evento = 'larga_duracion', false))
  on conflict (presupuesto_id) do update
    set estado = 'activo', deleted_at = null, deleted_by = null
  returning id into v_evento;

  if v_p.lead_id is not null then
    update public.leads set estado = 'ganado' where id = v_p.lead_id and deleted_at is null;
  end if;

  perform public.recalcular_estado_pago(p_id);
  return v_evento;
end;
$$;
