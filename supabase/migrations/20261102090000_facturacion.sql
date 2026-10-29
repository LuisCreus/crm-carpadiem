-- =====================================================================
-- CRM Carpa Diem · 8 · Facturación (Fase 11): qué falta por facturar
--
--   · Datos de facturación en el cliente y, si se factura a otro, en el evento.
--   · Cada evento tiene su plan de facturas: Reserva (importe × % de reserva)
--     y Resto. Se recalcula solo; las que se tocan a mano se respetan.
--   · Estados: Prevista → Emitida (recibe el número CD AAAA/n) → Pagada
--     (al pagarla se apunta sola como cobro del presupuesto).
--   · Proyectos de larga duración: mensualidades (cuota_mensual).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Datos de facturación
-- ---------------------------------------------------------------------
alter table public.clientes
  add column fact_nombre text,
  add column fact_nif text,
  add column fact_domicilio text,
  add column fact_cp_ciudad text,
  add column fact_email text;

alter table public.eventos
  add column fact_nombre text,
  add column fact_nif text,
  add column fact_domicilio text,
  add column fact_cp_ciudad text,
  add column fact_email text,
  add column cuota_mensual numeric(12, 2) check (cuota_mensual >= 0);

alter table public.ajustes
  add column dias_aviso_resto int not null default 7 check (dias_aviso_resto >= 0),
  add column dias_aviso_cobro_factura int not null default 15 check (dias_aviso_cobro_factura >= 0);

-- ---------------------------------------------------------------------
-- Numeración de facturas: CD AAAA/n, correlativa por año de emisión y sin huecos
-- ---------------------------------------------------------------------
create table public.numeracion_facturas (
  anio int primary key,
  ultimo_numero int not null default 0 check (ultimo_numero >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
select public.activar_seguimiento('numeracion_facturas', false);

-- ---------------------------------------------------------------------
-- Facturas
-- ---------------------------------------------------------------------
create table public.facturas (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid references public.eventos (id),
  cliente_id uuid references public.clientes (id),
  tipo text not null default 'otra' check (tipo in ('reserva', 'resto', 'mensualidad', 'otra')),
  concepto text,
  descripcion text,
  importe numeric(12, 2) not null check (importe >= 0),
  iva_pct numeric(5, 2) not null default 21 check (iva_pct >= 0),
  suplidos numeric(12, 2) not null default 0 check (suplidos >= 0),
  estado text not null default 'prevista' check (estado in ('prevista', 'emitida', 'pagada')),
  anio int,
  numero int,
  codigo text generated always as (case when numero is null then null else 'CD ' || anio || '/' || numero end) stored,
  fecha_emision date,
  fecha_pago date,
  fact_nombre text,
  fact_nif text,
  fact_domicilio text,
  fact_cp_ciudad text,
  fact_email text,
  cobro_id uuid references public.cobros (id),
  automatica boolean not null default false,
  comentarios text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  unique (anio, numero),
  check ((estado = 'prevista') = (numero is null))
);
create index facturas_evento_idx on public.facturas (evento_id);
select public.activar_seguimiento('facturas');

-- Una factura emitida no se borra ni cambia de importe (salvo el administrador)
create function public.proteger_factura() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.estado <> 'prevista' and not public.es_admin() and pg_trigger_depth() = 1 then
    if new.deleted_at is not null then
      raise exception 'Una factura emitida no se puede borrar';
    end if;
    if (new.importe, new.iva_pct, new.suplidos, new.anio, new.numero)
       is distinct from (old.importe, old.iva_pct, old.suplidos, old.anio, old.numero) then
      raise exception 'Una factura emitida no se puede cambiar de importe ni de número';
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
create trigger proteger_factura before update on public.facturas
for each row execute function public.proteger_factura();

-- ---------------------------------------------------------------------
-- Plan de facturas de un evento (Reserva + Resto), recalculado
-- ---------------------------------------------------------------------
create function public.texto_mes(p_fecha date) returns text
language sql immutable set search_path = '' as $$
  select (array['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO',
                'SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'])[extract(month from p_fecha)::int]
         || ' de ' || extract(year from p_fecha)::int;
$$;

create function public.planificar_facturas(p_evento uuid) returns void
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
  delete from public.facturas where evento_id = p_evento and estado = 'prevista' and automatica;

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
    select 1 from public.facturas where evento_id = p_evento and deleted_at is null and tipo = 'reserva'
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

-- Cuándo se recalcula: al crear el evento, al cambiar su importe/estado y al cambiar el % de reserva
create function public.al_cambiar_evento_facturas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.planificar_facturas(new.id);
  return null;
end;
$$;
create trigger planificar_facturas_alta after insert on public.eventos
for each row execute function public.al_cambiar_evento_facturas();
create trigger planificar_facturas_cambio
after update of importe, estado, deleted_at, es_larga_duracion, fecha_inicio, fecha_precision on public.eventos
for each row execute function public.al_cambiar_evento_facturas();

create function public.al_cambiar_reserva_facturas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.planificar_facturas(e.id) from public.eventos e where e.presupuesto_id = new.id;
  return null;
end;
$$;
create trigger planificar_facturas_reserva after update of reserva_pct on public.presupuestos
for each row execute function public.al_cambiar_reserva_facturas();

-- Al añadir, cambiar o borrar una factura a mano, se recalcula el resto
create function public.al_cambiar_factura() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  perform public.planificar_facturas(coalesce(new.evento_id, old.evento_id));
  return null;
end;
$$;
create trigger al_cambiar_factura after insert or update or delete on public.facturas
for each row execute function public.al_cambiar_factura();

-- ---------------------------------------------------------------------
-- Emitir: número correlativo + datos de facturación congelados
-- ---------------------------------------------------------------------
create function public.emitir_factura(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_f public.facturas;
  v_e public.eventos;
  v_c public.clientes;
  v_anio int := extract(year from (now() at time zone 'Europe/Madrid'))::int;
  v_numero int;
  v_codigo text;
begin
  if not public.es_usuario_activo() then
    raise exception 'Sin permiso';
  end if;
  select * into v_f from public.facturas where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Factura no encontrada';
  end if;
  if v_f.estado <> 'prevista' then
    raise exception 'Esta factura ya está emitida (%)', v_f.codigo;
  end if;

  -- Datos de facturación: los de la factura; si no, los del evento; si no, los del cliente
  if v_f.fact_nombre is null then
    select * into v_e from public.eventos where id = v_f.evento_id;
    select * into v_c from public.clientes where id = coalesce(v_f.cliente_id, v_e.cliente_id);
    if v_e.fact_nombre is not null then
      v_f.fact_nombre := v_e.fact_nombre; v_f.fact_nif := v_e.fact_nif; v_f.fact_domicilio := v_e.fact_domicilio;
      v_f.fact_cp_ciudad := v_e.fact_cp_ciudad; v_f.fact_email := v_e.fact_email;
    else
      v_f.fact_nombre := v_c.fact_nombre; v_f.fact_nif := v_c.fact_nif; v_f.fact_domicilio := v_c.fact_domicilio;
      v_f.fact_cp_ciudad := v_c.fact_cp_ciudad; v_f.fact_email := v_c.fact_email;
    end if;
  end if;
  if v_f.fact_nombre is null or v_f.fact_nif is null then
    raise exception 'Faltan los datos de facturación (nombre y NIF) del cliente';
  end if;

  insert into public.numeracion_facturas (anio) values (v_anio) on conflict (anio) do nothing;
  update public.numeracion_facturas set ultimo_numero = ultimo_numero + 1
   where anio = v_anio returning ultimo_numero into v_numero;

  update public.facturas set
    estado = 'emitida', anio = v_anio, numero = v_numero,
    fecha_emision = (now() at time zone 'Europe/Madrid')::date,
    fact_nombre = v_f.fact_nombre, fact_nif = v_f.fact_nif, fact_domicilio = v_f.fact_domicilio,
    fact_cp_ciudad = v_f.fact_cp_ciudad, fact_email = v_f.fact_email
  where id = p_id
  returning codigo into v_codigo;
  return v_codigo;
end;
$$;

-- ---------------------------------------------------------------------
-- Pagada: se apunta sola como cobro del presupuesto (si el evento lo tiene)
-- ---------------------------------------------------------------------
create function public.marcar_factura_pagada(p_id uuid, p_fecha date) returns void
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
    insert into public.cobros (presupuesto_id, fecha, importe, concepto, notas)
    values (v_presupuesto, p_fecha, v_f.importe,
            (case v_f.tipo when 'reserva' then 'reserva' when 'resto' then 'resto' else 'otro' end)::public.concepto_cobro,
            'Factura ' || v_f.codigo)
    returning id into v_cobro;
  end if;
  update public.facturas set estado = 'pagada', fecha_pago = p_fecha, cobro_id = v_cobro where id = p_id;
end;
$$;

create function public.desmarcar_factura_pagada(p_id uuid) returns void
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
  if v_f.cobro_id is not null then
    update public.cobros set deleted_at = now(), deleted_by = auth.uid() where id = v_f.cobro_id;
  end if;
  update public.facturas set estado = 'emitida', fecha_pago = null, cobro_id = null where id = p_id;
end;
$$;

revoke execute on function public.planificar_facturas(uuid), public.al_cambiar_evento_facturas(),
  public.al_cambiar_reserva_facturas(), public.al_cambiar_factura(), public.proteger_factura() from public, anon, authenticated;
grant execute on function public.emitir_factura(uuid), public.marcar_factura_pagada(uuid, date),
  public.desmarcar_factura_pagada(uuid), public.texto_mes(date) to authenticated;

-- ---------------------------------------------------------------------
-- Permisos, papelera y tiempo real
-- ---------------------------------------------------------------------
alter table public.facturas enable row level security;
create policy ver on public.facturas for select to authenticated
  using (public.es_usuario_activo() and (deleted_at is null or public.es_admin()));
create policy crear on public.facturas for insert to authenticated
  with check (public.es_usuario_activo() and deleted_at is null and estado = 'prevista');
create policy editar on public.facturas for update to authenticated
  using (public.es_usuario_activo() and deleted_at is null)
  with check (public.es_usuario_activo() and deleted_at is null);
create policy eliminar on public.facturas for delete to authenticated using (public.es_admin());
-- El número, el estado y las fechas de emisión y pago solo los ponen emitir/pagar
grant select, insert, delete on public.facturas to authenticated;
grant update (evento_id, cliente_id, tipo, concepto, descripcion, importe, iva_pct, suplidos,
  fact_nombre, fact_nif, fact_domicilio, fact_cp_ciudad, fact_email, comentarios, automatica)
  on public.facturas to authenticated;

alter table public.numeracion_facturas enable row level security;
create policy ver on public.numeracion_facturas for select to authenticated using (public.es_usuario_activo());
create policy crear on public.numeracion_facturas for insert to authenticated with check (public.es_admin());
create policy editar on public.numeracion_facturas for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
grant select, insert, update on public.numeracion_facturas to authenticated;

create or replace function public.tablas_con_papelera() returns text[]
language sql immutable as $$
  select array['clientes', 'contactos', 'intermediarios', 'leads', 'oportunidades',
               'presupuestos', 'presupuesto_versiones', 'cobros', 'eventos',
               'inventario', 'material_movimientos', 'facturas'];
$$;

create or replace view public.papelera with (security_invoker = true) as
  select 'clientes'::text as tabla, id, nombre as descripcion, deleted_at, deleted_by
    from public.clientes where deleted_at is not null
  union all
  select 'contactos', id, nombre, deleted_at, deleted_by
    from public.contactos where deleted_at is not null
  union all
  select 'intermediarios', id, nombre, deleted_at, deleted_by
    from public.intermediarios where deleted_at is not null
  union all
  select 'leads', id, cliente_nombre, deleted_at, deleted_by
    from public.leads where deleted_at is not null
  union all
  select 'oportunidades', id, coalesce(nombre, 'Oportunidad'), deleted_at, deleted_by
    from public.oportunidades where deleted_at is not null
  union all
  select 'presupuestos', p.id, p.codigo || ' · ' || coalesce(c.nombre, ''), p.deleted_at, p.deleted_by
    from public.presupuestos p left join public.clientes c on c.id = p.cliente_id
   where p.deleted_at is not null
  union all
  select 'presupuesto_versiones', id, 'Versión V' || lpad(version::text, 2, '0'), deleted_at, deleted_by
    from public.presupuesto_versiones where deleted_at is not null
  union all
  select 'cobros', id, 'Cobro de ' || importe::text || ' € del ' || to_char(fecha, 'DD/MM/YYYY'), deleted_at, deleted_by
    from public.cobros where deleted_at is not null
  union all
  select 'eventos', e.id, 'Evento · ' || coalesce(c.nombre, ''), e.deleted_at, e.deleted_by
    from public.eventos e left join public.clientes c on c.id = e.cliente_id
   where e.deleted_at is not null
  union all
  select 'inventario', id, material, deleted_at, deleted_by
    from public.inventario where deleted_at is not null
  union all
  select 'material_movimientos', id, material, deleted_at, deleted_by
    from public.material_movimientos where deleted_at is not null
  union all
  select 'facturas', id, 'Factura prevista de ' || importe::text || ' € · ' || coalesce(concepto, tipo), deleted_at, deleted_by
    from public.facturas where deleted_at is not null;

alter publication supabase_realtime add table public.facturas, public.numeracion_facturas;

-- Plan inicial para los eventos que ya existen
select public.planificar_facturas(id) from public.eventos;
