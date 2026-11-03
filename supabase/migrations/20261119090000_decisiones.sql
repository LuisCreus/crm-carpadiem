-- =====================================================================
-- CRM Carpa Diem · 22 · Decisiones de la revisión (noviembre 2026)
--
--   · Código del presupuesto con el año desde 2027: «CD 001/27» (los de 2026, igual).
--   · Una factura emitida no la borra nadie (ni el administrador): se rectifica.
--   · Banco, equipos (CAPEX) y datos a mano de la P&L: solo el administrador.
-- =====================================================================

-- Código con año (la vista de la papelera lo usa: se rehace)
drop view public.papelera;
alter table public.presupuestos drop column codigo;
alter table public.presupuestos add column codigo text generated always as
  ('CD ' || lpad(numero::text, 3, '0') || case when anio >= 2027 then '/' || right(anio::text, 2) else '' end) stored;
create view public.papelera with (security_invoker = true) as
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
    from public.facturas where deleted_at is not null
  union all
  select 'proveedores', id, 'Proveedor · ' || nombre, deleted_at, deleted_by
    from public.proveedores where deleted_at is not null
  union all
  select 'facturas_recibidas', r.id, 'Factura recibida · ' || coalesce(p.nombre, '') || ' · ' || r.total::text || ' €', r.deleted_at, r.deleted_by
    from public.facturas_recibidas r left join public.proveedores p on p.id = r.proveedor_id
   where r.deleted_at is not null;
grant select on public.papelera to authenticated;

-- Facturas emitidas: nadie las borra
create function public.no_borrar_emitida() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.estado <> 'prevista' then
      raise exception 'Una factura emitida no se puede borrar: si hay un error, se hace una factura rectificativa';
    end if;
    return old;
  end if;
  if old.estado <> 'prevista' and new.deleted_at is not null and old.deleted_at is null then
    raise exception 'Una factura emitida no se puede borrar: si hay un error, se hace una factura rectificativa';
  end if;
  return new;
end;
$$;
create trigger no_borrar_emitida before update of deleted_at or delete on public.facturas
for each row execute function public.no_borrar_emitida();

-- Banco, equipos y datos a mano de la P&L: solo el administrador los ve y los cambia
do $$
declare
  t text;
begin
  foreach t in array array['movimientos_banco', 'reglas_banco', 'activos', 'pyg_manual'] loop
    execute format('drop policy ver on public.%I', t);
    execute format('create policy ver on public.%I for select to authenticated using (public.es_admin())', t);
    execute format('drop policy if exists crear on public.%I', t);
    execute format('create policy crear on public.%I for insert to authenticated with check (public.es_admin())', t);
    execute format('drop policy if exists editar on public.%I', t);
    execute format('create policy editar on public.%I for update to authenticated using (public.es_admin()) with check (public.es_admin())', t);
  end loop;
end;
$$;
