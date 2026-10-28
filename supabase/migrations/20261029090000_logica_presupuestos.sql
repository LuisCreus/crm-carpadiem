-- =====================================================================
-- CRM Carpa Diem · 4 · Reglas de negocio de presupuestos, cobros y eventos
-- =====================================================================

-- El evento guarda también si la fecha es exacta, solo mes o por definir
alter table public.eventos
  add column fecha_precision public.precision_fecha not null default 'dia';

-- Si alguien saca a mano un presupuesto de "Caducado", no se vuelve a caducar solo
alter table public.presupuestos
  add column no_caducar boolean not null default false;

-- ---------------------------------------------------------------------
-- Estado de pago: se calcula solo a partir de los cobros
-- ---------------------------------------------------------------------
create function public.estado_pago(p_importe numeric, p_reserva_pct numeric, p_cobrado numeric)
returns public.estado_presupuesto
language sql immutable set search_path = '' as $$
  select (case
    when p_importe is not null and p_importe > 0 and p_cobrado >= p_importe then 'pagado'
    when p_cobrado > 0 and p_cobrado >= round(coalesce(p_importe, 0) * coalesce(p_reserva_pct, 0) / 100, 2)
      then 'reserva_pagada'
    else 'aceptado'
  end)::public.estado_presupuesto;
$$;

create function public.recalcular_estado_pago(p_presupuesto uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_p public.presupuestos;
  v_cobrado numeric;
  v_nuevo public.estado_presupuesto;
begin
  select * into v_p from public.presupuestos where id = p_presupuesto;
  if not found or v_p.estado not in ('aceptado', 'reserva_pagada', 'pagado') then
    return;
  end if;
  select coalesce(sum(importe), 0) into v_cobrado
    from public.cobros where presupuesto_id = p_presupuesto and deleted_at is null;
  v_nuevo := public.estado_pago(v_p.importe, v_p.reserva_pct, v_cobrado);
  if v_nuevo <> v_p.estado then
    update public.presupuestos set estado = v_nuevo where id = p_presupuesto;
  end if;
end;
$$;

create function public.al_cambiar_cobro() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalcular_estado_pago(old.presupuesto_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.presupuesto_id <> old.presupuesto_id) then
    perform public.recalcular_estado_pago(new.presupuesto_id);
  end if;
  return null;
end;
$$;
create trigger al_cambiar_cobro
after insert or update or delete on public.cobros
for each row execute function public.al_cambiar_cobro();

create function public.al_cambiar_importe() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.recalcular_estado_pago(new.id);
  -- El importe del evento sigue al del presupuesto
  update public.eventos set importe = new.importe
   where presupuesto_id = new.id and importe is distinct from new.importe;
  return null;
end;
$$;
create trigger al_cambiar_importe
after update of importe, reserva_pct on public.presupuestos
for each row when (pg_trigger_depth() < 1)
execute function public.al_cambiar_importe();

-- ---------------------------------------------------------------------
-- Cambios de estado manuales
-- ---------------------------------------------------------------------
create function public.al_cambiar_estado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado is distinct from old.estado then
    -- Sacar a mano un presupuesto de "Caducado" lo deja fuera del caducado automático
    if old.estado = 'caducado' and new.estado <> 'caducado' then
      new.no_caducar := true;
    end if;
    -- Si deja de estar aceptado, su evento queda cancelado (se reactiva al volver a aceptarlo)
    if old.estado in ('aceptado', 'reserva_pagada', 'pagado')
       and new.estado not in ('aceptado', 'reserva_pagada', 'pagado') then
      update public.eventos set estado = 'cancelado'
       where presupuesto_id = new.id and estado = 'activo';
    end if;
  end if;
  return new;
end;
$$;
create trigger al_cambiar_estado
before update of estado on public.presupuestos
for each row execute function public.al_cambiar_estado();

-- ---------------------------------------------------------------------
-- Aceptar: crea o reactiva el evento y descarta las demás opciones
-- ---------------------------------------------------------------------
create function public.aceptar_presupuesto(p_id uuid, p_modalidad public.modalidad_evento default 'confirmado')
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
    p_modalidad, v_p.tipo_evento = 'larga_duracion')
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

-- ---------------------------------------------------------------------
-- Marcar como enviado
-- ---------------------------------------------------------------------
create function public.marcar_enviado(p_id uuid, p_version int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_lead uuid;
begin
  if not public.es_usuario_activo() then
    raise exception 'Sin permiso';
  end if;
  update public.presupuestos
     set enviado_at = now(),
         version_enviada = p_version,
         estado = case when estado = 'borrador' then 'pendiente'::public.estado_presupuesto else estado end
   where id = p_id and deleted_at is null
  returning lead_id into v_lead;
  if not found then
    raise exception 'Presupuesto no encontrado';
  end if;

  update public.presupuesto_versiones set enviado_at = now()
   where presupuesto_id = p_id and version = p_version;

  if v_lead is not null then
    update public.leads set estado = 'presupuesto_enviado'
     where id = v_lead and deleted_at is null
       and estado in ('por_contactar', 'contactado', 'interesado');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Caducar: Pendiente con la fecha del evento ya pasada
-- ---------------------------------------------------------------------
create function public.marcar_caducados() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_hoy date := (now() at time zone 'Europe/Madrid')::date;
  v_n int;
begin
  update public.presupuestos
     set estado = 'caducado'
   where estado = 'pendiente'
     and deleted_at is null
     and not no_caducar
     and fecha_precision <> 'por_definir'
     and case fecha_precision
           when 'dia' then coalesce(fecha_fin, fecha_evento)
           else (date_trunc('month', fecha_evento) + interval '1 month - 1 day')::date
         end < v_hoy;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- Crear un presupuesto con su cliente, contactos y oportunidad, de una vez
-- ---------------------------------------------------------------------
create function public.crear_presupuesto(p jsonb) returns public.presupuestos
language plpgsql security invoker set search_path = '' as $$
declare
  v_cliente uuid := nullif(p ->> 'cliente_id', '')::uuid;
  v_oportunidad uuid := nullif(p ->> 'oportunidad_id', '')::uuid;
  v_contacto jsonb;
  v_orden int := 0;
  v_p public.presupuestos;
begin
  if v_cliente is null then
    insert into public.clientes (nombre, tipo_cliente)
    values (trim(p ->> 'cliente_nombre'), nullif(p ->> 'tipo_cliente', ''))
    returning id into v_cliente;
  end if;

  for v_contacto in select * from jsonb_array_elements(coalesce(p -> 'contactos', '[]'::jsonb)) loop
    if coalesce(trim(v_contacto ->> 'nombre'), '') <> '' then
      insert into public.contactos (cliente_id, nombre, rol, telefono, email, orden)
      values (v_cliente, trim(v_contacto ->> 'nombre'), nullif(v_contacto ->> 'rol', ''),
              nullif(trim(v_contacto ->> 'telefono'), ''), nullif(trim(v_contacto ->> 'email'), ''), v_orden);
      v_orden := v_orden + 1;
    end if;
  end loop;

  if v_oportunidad is null then
    insert into public.oportunidades (cliente_id) values (v_cliente) returning id into v_oportunidad;
  end if;

  insert into public.presupuestos (
    oportunidad_id, cliente_id, lead_id, tipo_evento, intermediario_id, comision_pct,
    fecha_precision, fecha_evento, fecha_fin, ubicacion, provincia, material,
    comercial_id, reserva_pct, plantilla)
  values (
    v_oportunidad, v_cliente, nullif(p ->> 'lead_id', '')::uuid, nullif(p ->> 'tipo_evento', ''),
    nullif(p ->> 'intermediario_id', '')::uuid, nullif(p ->> 'comision_pct', '')::numeric,
    coalesce(nullif(p ->> 'fecha_precision', ''), 'dia')::public.precision_fecha,
    nullif(p ->> 'fecha_evento', '')::date, nullif(p ->> 'fecha_fin', '')::date,
    nullif(trim(p ->> 'ubicacion'), ''), nullif(trim(p ->> 'provincia'), ''), nullif(trim(p ->> 'material'), ''),
    nullif(p ->> 'comercial_id', '')::uuid, nullif(p ->> 'reserva_pct', '')::numeric,
    coalesce(nullif(p ->> 'plantilla', ''), 'carpadiem')::public.plantilla_presupuesto)
  returning * into v_p;

  insert into public.presupuesto_versiones (presupuesto_id, version) values (v_p.id, 1);

  if v_p.lead_id is not null then
    update public.leads set cliente_id = v_cliente where id = v_p.lead_id and cliente_id is null;
  end if;

  return v_p;
end;
$$;

-- Nueva versión (V02, V03…): devuelve el número de versión creado
create function public.nueva_version(p_id uuid) returns int
language plpgsql security invoker set search_path = '' as $$
declare
  v_version int;
begin
  select coalesce(max(version), 0) + 1 into v_version
    from public.presupuesto_versiones where presupuesto_id = p_id;
  insert into public.presupuesto_versiones (presupuesto_id, version) values (p_id, v_version);
  return v_version;
end;
$$;

grant execute on function
  public.aceptar_presupuesto(uuid, public.modalidad_evento),
  public.marcar_enviado(uuid, int),
  public.marcar_caducados(),
  public.crear_presupuesto(jsonb),
  public.nueva_version(uuid),
  public.estado_pago(numeric, numeric, numeric)
to authenticated;

-- ---------------------------------------------------------------------
-- Caducado automático cada noche (si la base de datos tiene pg_cron)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.schedule('caducar-presupuestos', '0 3 * * *', 'select public.marcar_caducados()');
    exception when others then
      -- Si no se puede programar, no pasa nada: la app también caduca al abrir Presupuestos
      raise notice 'pg_cron no disponible: %', sqlerrm;
    end;
  end if;
end;
$$;
