-- =====================================================================
-- CRM Carpa Diem · 21 · Revisión de noviembre de 2026: seguridad y coherencia
--
--   · Facturas: el número, el estado y las fechas solo los ponen emitir/pagar
--     (aunque Supabase dé permiso de escritura a toda la tabla). Una factura
--     emitida no cambia de datos fiscales ni de concepto.
--   · Presupuestos: el número lo pone siempre el contador (salvo el administrador).
--   · Banco: los movimientos y reglas solo los borra el administrador.
--   · Altas: solo con la cuenta de Microsoft (no con email y contraseña).
--   · Auditoría: «creado por» es siempre quien lo crea.
--   · Cobros y facturas a la par; presupuestos con facturas no vuelven atrás;
--     el seguimiento se reinicia al enviar; reaceptar respeta la modalidad.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Facturas
-- ---------------------------------------------------------------------
-- Escritura directa desde la app (rol authenticated). Dentro de emitir_factura,
-- marcar_factura_pagada, etc. (security definer) current_user es el propietario.
create function public.es_escritura_directa() returns boolean
language sql stable set search_path = '' as $$
  select current_user = 'authenticated'
$$;

create or replace function public.proteger_factura() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.es_escritura_directa()
     and (new.estado, new.anio, new.numero, new.fecha_emision, new.fecha_pago, new.cobro_id)
         is distinct from (old.estado, old.anio, old.numero, old.fecha_emision, old.fecha_pago, old.cobro_id) then
    raise exception 'El número, el estado y las fechas de una factura solo se cambian al emitirla o marcarla como pagada';
  end if;
  if old.estado <> 'prevista' and not public.es_admin() and pg_trigger_depth() = 1 then
    if new.deleted_at is not null then
      raise exception 'Una factura emitida no se puede borrar';
    end if;
    if (new.importe, new.iva_pct, new.suplidos, new.anio, new.numero)
       is distinct from (old.importe, old.iva_pct, old.suplidos, old.anio, old.numero) then
      raise exception 'Una factura emitida no se puede cambiar de importe ni de número';
    end if;
    if (new.tipo, new.concepto, new.descripcion, new.fact_nombre, new.fact_nif, new.fact_domicilio, new.fact_cp_ciudad)
       is distinct from (old.tipo, old.concepto, old.descripcion, old.fact_nombre, old.fact_nif, old.fact_domicilio, old.fact_cp_ciudad) then
      raise exception 'Una factura emitida no se puede cambiar: si hay un error, se hace una factura rectificativa';
    end if;
  end if;
  -- Si alguien toca a mano una prevista automática, pasa a ser manual (el plan la respeta)
  if old.automatica and pg_trigger_depth() = 1
     and (new.importe, new.tipo, new.concepto, new.descripcion, new.iva_pct, new.suplidos, new.fact_nombre, new.comentarios)
         is distinct from (old.importe, old.tipo, old.concepto, old.descripcion, old.iva_pct, old.suplidos, old.fact_nombre, old.comentarios) then
    new.automatica := false;
  end if;
  return new;
end;
$$;

-- Las facturas nuevas que se crean desde la app nacen «por emitir»
create function public.proteger_factura_alta() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.es_escritura_directa()
     and (new.estado <> 'prevista' or new.numero is not null or new.anio is not null
          or new.fecha_emision is not null or new.fecha_pago is not null or new.cobro_id is not null) then
    raise exception 'Las facturas se crean por emitir; el número lo pone «Emitir»';
  end if;
  return new;
end;
$$;
create trigger proteger_factura_alta before insert on public.facturas
for each row execute function public.proteger_factura_alta();

-- ---------------------------------------------------------------------
-- Presupuestos: el número lo pone el contador
-- ---------------------------------------------------------------------
create or replace function public.numerar_presupuesto() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.numero is null then
    new.anio := extract(year from (now() at time zone 'Europe/Madrid'))::int;
    new.numero := public.siguiente_numero_presupuesto(new.anio);
  elsif new.anio is null then
    raise exception 'Si se indica el número, hay que indicar también el año';
  elsif auth.uid() is not null and not public.es_admin() then
    raise exception 'El número del presupuesto lo pone el CRM';
  end if;
  return new;
end;
$$;

create function public.proteger_numero_presupuesto() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.anio, new.numero) is distinct from (old.anio, old.numero)
     and public.es_escritura_directa() and not public.es_admin() then
    raise exception 'El número del presupuesto no se puede cambiar';
  end if;
  return new;
end;
$$;
create trigger proteger_numero_presupuesto before update of anio, numero on public.presupuestos
for each row execute function public.proteger_numero_presupuesto();

-- ---------------------------------------------------------------------
-- Banco: borrar solo el administrador
-- ---------------------------------------------------------------------
drop policy eliminar on public.movimientos_banco;
drop policy eliminar on public.reglas_banco;
create policy eliminar on public.movimientos_banco for delete to authenticated using (public.es_admin());
create policy eliminar on public.reglas_banco for delete to authenticated using (public.es_admin());

-- ---------------------------------------------------------------------
-- Altas: solo con Microsoft
-- ---------------------------------------------------------------------
create or replace function public.al_crear_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(new.email);
  v_dominio text := split_part(lower(new.email), '@', 2);
  v_ajustes public.ajustes;
begin
  if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'azure' then
    raise exception 'SOLO_MICROSOFT: hay que entrar con la cuenta de Microsoft';
  end if;
  select * into v_ajustes from public.ajustes where id;
  if v_email is null or not (v_dominio = any (v_ajustes.dominios_permitidos)) then
    raise exception 'DOMINIO_NO_PERMITIDO: %', coalesce(v_dominio, '(sin email)');
  end if;

  insert into public.perfiles (id, email, nombre, rol)
  values (
    new.id,
    v_email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    case when v_email = any (v_ajustes.emails_admin) then 'admin'::public.rol_usuario
         else 'usuario'::public.rol_usuario end
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Auditoría y permisos de funciones futuras
-- ---------------------------------------------------------------------
create or replace function public.poner_auditoria() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

alter default privileges revoke execute on functions from public;
revoke execute on function public.marcar_caducados() from public, anon;
grant execute on function public.marcar_caducados() to authenticated;

-- ---------------------------------------------------------------------
-- Sueldo del director: sale de las facturas de Maketa, nunca a mano
-- ---------------------------------------------------------------------
delete from public.pyg_manual where concepto = 'director';

-- ---------------------------------------------------------------------
-- Cobros y facturas siempre a la par
--   · Al marcar una factura como pagada, si ya hay un cobro apuntado a mano
--     por ese importe (y sin factura), se enlaza en lugar de duplicarlo.
--   · Un cobro que viene de una factura no se borra suelto: se desmarca la factura.
-- ---------------------------------------------------------------------
create or replace function public.marcar_factura_pagada(p_id uuid, p_fecha date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_f public.facturas;
  v_presupuesto uuid;
  v_cobro uuid;
begin
  if not public.es_usuario_activo() then
    raise exception 'Sin permiso';
  end if;
  select * into v_f from public.facturas where id = p_id and deleted_at is null for update;
  if not found or v_f.estado <> 'emitida' then
    raise exception 'Solo se puede marcar como pagada una factura emitida';
  end if;
  select presupuesto_id into v_presupuesto from public.eventos where id = v_f.evento_id;
  if v_presupuesto is not null and v_f.importe > 0 then
    select c.id into v_cobro from public.cobros c
     where c.presupuesto_id = v_presupuesto and c.deleted_at is null and c.importe = v_f.importe
       and not exists (select 1 from public.facturas x where x.cobro_id = c.id and x.deleted_at is null)
     order by c.fecha limit 1;
    if v_cobro is not null then
      update public.cobros set notas = concat_ws(' · ', nullif(notas, ''), 'Factura ' || v_f.codigo) where id = v_cobro;
    else
      insert into public.cobros (presupuesto_id, fecha, importe, concepto, notas)
      values (v_presupuesto, p_fecha, v_f.importe,
              (case v_f.tipo when 'reserva' then 'reserva' when 'resto' then 'resto' else 'otro' end)::public.concepto_cobro,
              'Factura ' || v_f.codigo)
      returning id into v_cobro;
    end if;
  end if;
  update public.facturas set estado = 'pagada', fecha_pago = p_fecha, cobro_id = v_cobro where id = p_id;
end;
$$;

create or replace function public.desmarcar_factura_pagada(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_f public.facturas;
begin
  if not public.es_usuario_activo() then
    raise exception 'Sin permiso';
  end if;
  select * into v_f from public.facturas where id = p_id and deleted_at is null for update;
  if not found or v_f.estado <> 'pagada' then
    raise exception 'La factura no está marcada como pagada';
  end if;
  update public.facturas set estado = 'emitida', fecha_pago = null, cobro_id = null where id = p_id;
  if v_f.cobro_id is not null then
    update public.cobros set deleted_at = now(), deleted_by = auth.uid() where id = v_f.cobro_id;
  end if;
end;
$$;

create function public.proteger_cobro() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_codigo text;
begin
  if new.deleted_at is not null and old.deleted_at is null then
    select codigo into v_codigo from public.facturas where cobro_id = old.id and deleted_at is null and estado = 'pagada' limit 1;
    if v_codigo is not null then
      raise exception 'Este cobro es el de la factura %: desmárcala como pagada desde la factura', v_codigo;
    end if;
  end if;
  return new;
end;
$$;
create trigger proteger_cobro before update of deleted_at on public.cobros
for each row execute function public.proteger_cobro();

-- ---------------------------------------------------------------------
-- Un presupuesto con facturas emitidas no vuelve atrás (solo puede caerse)
-- ---------------------------------------------------------------------
create or replace function public.al_cambiar_estado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado is distinct from old.estado then
    if old.estado = 'caducado' and new.estado <> 'caducado' then
      new.no_caducar := true;
    end if;
    if old.estado in ('aceptado', 'reserva_pagada', 'pagado')
       and new.estado not in ('aceptado', 'reserva_pagada', 'pagado') then
      if new.estado <> 'caido' and exists (
        select 1 from public.facturas f join public.eventos e on e.id = f.evento_id
         where e.presupuesto_id = new.id and f.deleted_at is null and f.estado <> 'prevista') then
        raise exception 'Este presupuesto ya tiene facturas emitidas: si no se hace, márcalo como caído desde su evento';
      end if;
      update public.eventos set estado = 'cancelado'
       where presupuesto_id = new.id and estado = 'activo';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Seguimiento: también se reinicia al enviar una versión nueva
-- ---------------------------------------------------------------------
create or replace function public.presupuesto_seguimiento() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.seguimiento_desde := now();
  elsif old.seguimiento_desde is not null
        and (new.estado is distinct from old.estado or new.enviado_at is distinct from old.enviado_at) then
    new.seguimiento_desde := now();
  end if;
  return new;
end;
$$;
drop trigger presupuesto_seguimiento on public.presupuestos;
create trigger presupuesto_seguimiento before insert or update of estado, enviado_at on public.presupuestos
  for each row execute function public.presupuesto_seguimiento();

-- ---------------------------------------------------------------------
-- Volver a aceptar un presupuesto respeta la modalidad elegida (seguro de lluvia)
-- ---------------------------------------------------------------------
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
    set estado = 'activo', deleted_at = null, deleted_by = null,
        modalidad = case when public.eventos.estado = 'activo' then public.eventos.modalidad else excluded.modalidad end
  returning id into v_evento;

  if v_p.lead_id is not null then
    update public.leads set estado = 'ganado' where id = v_p.lead_id and deleted_at is null;
  end if;

  perform public.recalcular_estado_pago(p_id);
  return v_evento;
end;
$$;
