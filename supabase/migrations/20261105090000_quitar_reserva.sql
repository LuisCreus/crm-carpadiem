-- =====================================================================
-- CRM Carpa Diem · 11 · Quitar la factura de reserva
-- Si alguien quita la reserva prevista (el cliente lo paga todo de una vez),
-- el plan ya no la vuelve a crear: todo va en el Resto.
-- =====================================================================

create or replace function public.planificar_facturas(p_evento uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.eventos;
  v_pct numeric;
  v_total numeric;
  v_planificado numeric;
  v_reserva numeric;
  v_resto numeric;
begin
  select * into v_e from public.eventos where id = p_evento;
  if not found then
    return;
  end if;
  -- Las previstas automáticas se rehacen; las que alguien quitó (en la papelera) se quedan como están
  delete from public.facturas where evento_id = p_evento and estado = 'prevista' and automatica and deleted_at is null;

  if v_e.estado <> 'activo' or v_e.deleted_at is not null or v_e.es_larga_duracion then
    return;
  end if;
  v_total := coalesce(v_e.importe, 0);
  if v_total <= 0 then
    return;
  end if;
  select reserva_pct into v_pct from public.presupuestos where id = v_e.presupuesto_id;
  select coalesce(sum(importe), 0) into v_planificado
    from public.facturas where evento_id = p_evento and deleted_at is null and tipo <> 'mensualidad';

  if coalesce(v_pct, 0) > 0 and not exists (
    -- Si ya hay reserva, o se quitó a mano (está en la papelera), no se vuelve a crear
    select 1 from public.facturas where evento_id = p_evento and tipo = 'reserva'
  ) then
    v_reserva := least(round(v_total * v_pct / 100, 2), v_total - v_planificado);
    if v_reserva > 0 then
      insert into public.facturas (evento_id, cliente_id, tipo, concepto, descripcion, importe, automatica)
      values (p_evento, v_e.cliente_id, 'reserva',
              'Honorarios correspondientes a "primer pago y reserva de material"', v_e.material, v_reserva, true);
      v_planificado := v_planificado + v_reserva;
    end if;
  end if;

  v_resto := v_total - v_planificado;
  if v_resto > 0.004 then
    insert into public.facturas (evento_id, cliente_id, tipo, concepto, descripcion, importe, automatica)
    values (p_evento, v_e.cliente_id, 'resto',
            'Honorarios correspondientes a servicio de CARPAS'
              || case when v_e.fecha_inicio is not null and v_e.fecha_precision <> 'por_definir'
                      then ' en ' || public.texto_mes(v_e.fecha_inicio) else '' end,
            v_e.material, v_resto, true);
  end if;
end;
$$;
