-- =====================================================================
-- CRM Carpa Diem · 3/3 · Permisos, papelera y tiempo real
--
--   · Todo el equipo (usuarios activos) ve y edita todo.
--   · Borrar = mover a la papelera (función papelera_mover).
--   · Solo el administrador ve la papelera, restaura, borra definitivamente
--     y cambia usuarios, listas y ajustes.
-- =====================================================================

-- Nadie sin sesión accede a nada
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.es_admin(), public.es_usuario_activo() to authenticated;

-- ---------------------------------------------------------------------
-- Tablas de negocio (con papelera)
-- ---------------------------------------------------------------------
create function public.tablas_con_papelera() returns text[]
language sql immutable as $$
  select array['clientes', 'contactos', 'intermediarios', 'leads', 'oportunidades',
               'presupuestos', 'presupuesto_versiones', 'cobros', 'eventos',
               'inventario', 'material_movimientos'];
$$;

do $$
declare
  t text;
begin
  foreach t in array public.tablas_con_papelera() loop
    execute format('alter table public.%I enable row level security', t);
    -- Ver: todo lo que no está en la papelera (el admin ve también la papelera)
    execute format($p$create policy ver on public.%I for select to authenticated
      using (public.es_usuario_activo() and (deleted_at is null or public.es_admin()))$p$, t);
    execute format($p$create policy crear on public.%I for insert to authenticated
      with check (public.es_usuario_activo() and deleted_at is null)$p$, t);
    -- Editar: solo lo que no está en la papelera; no se puede "borrar" editando
    execute format($p$create policy editar on public.%I for update to authenticated
      using (public.es_usuario_activo() and deleted_at is null)
      with check (public.es_usuario_activo() and deleted_at is null)$p$, t);
    -- Borrar definitivamente: solo el administrador
    execute format($p$create policy eliminar on public.%I for delete to authenticated
      using (public.es_admin())$p$, t);
  end loop;
end;
$$;

-- evento_montadores: tabla de relación, sin papelera (se quita y ya)
alter table public.evento_montadores enable row level security;
create policy ver on public.evento_montadores for select to authenticated
  using (public.es_usuario_activo());
create policy crear on public.evento_montadores for insert to authenticated
  with check (public.es_usuario_activo());
create policy editar on public.evento_montadores for update to authenticated
  using (public.es_usuario_activo()) with check (public.es_usuario_activo());
create policy eliminar on public.evento_montadores for delete to authenticated
  using (public.es_usuario_activo());

-- ---------------------------------------------------------------------
-- Listas, ajustes y numeración: todos leen, solo el administrador cambia
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['comerciales', 'tipos_cliente', 'tipos_evento', 'canales_lead',
                           'roles_contacto', 'montadores', 'ajustes', 'numeracion_anual'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy ver on public.%I for select to authenticated
      using (public.es_usuario_activo())$p$, t);
    execute format($p$create policy crear on public.%I for insert to authenticated
      with check (public.es_admin())$p$, t);
    execute format($p$create policy editar on public.%I for update to authenticated
      using (public.es_admin()) with check (public.es_admin())$p$, t);
    execute format($p$create policy eliminar on public.%I for delete to authenticated
      using (public.es_admin())$p$, t);
  end loop;
end;
$$;
revoke insert, delete on public.ajustes from authenticated;

-- ---------------------------------------------------------------------
-- Usuarios: todos ven la lista; solo el administrador cambia rol o activo
-- ---------------------------------------------------------------------
alter table public.perfiles enable row level security;
create policy ver on public.perfiles for select to authenticated
  using (public.es_usuario_activo());
create policy editar on public.perfiles for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
revoke insert, delete on public.perfiles from authenticated;

-- El administrador no puede quitarse a sí mismo el rol ni desactivarse
create function public.proteger_admin() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.id = auth.uid() and (new.rol <> 'admin' or not new.activo) then
    raise exception 'No puedes quitarte el rol de administrador ni desactivarte a ti mismo';
  end if;
  if new.email <> old.email then
    raise exception 'El email no se puede cambiar';
  end if;
  return new;
end;
$$;
create trigger proteger_admin before update on public.perfiles
for each row execute function public.proteger_admin();

-- ---------------------------------------------------------------------
-- Historial: todos lo leen; nadie lo toca (lo escriben los triggers)
-- ---------------------------------------------------------------------
alter table public.historial enable row level security;
create policy ver on public.historial for select to authenticated
  using (public.es_usuario_activo());
revoke insert, update, delete on public.historial from authenticated;

-- ---------------------------------------------------------------------
-- Papelera
-- ---------------------------------------------------------------------
create function public.papelera_mover(p_tabla text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_usuario_activo() then
    raise exception 'Sin permiso';
  end if;
  if not (p_tabla = any (public.tablas_con_papelera())) then
    raise exception 'Tabla no válida: %', p_tabla;
  end if;
  execute format(
    'update public.%I set deleted_at = now(), deleted_by = auth.uid()
      where id = $1 and deleted_at is null', p_tabla)
  using p_id;
end;
$$;

create function public.papelera_restaurar(p_tabla text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede restaurar';
  end if;
  if not (p_tabla = any (public.tablas_con_papelera())) then
    raise exception 'Tabla no válida: %', p_tabla;
  end if;
  execute format(
    'update public.%I set deleted_at = null, deleted_by = null where id = $1', p_tabla)
  using p_id;
end;
$$;

create function public.papelera_eliminar(p_tabla text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede borrar definitivamente';
  end if;
  if not (p_tabla = any (public.tablas_con_papelera())) then
    raise exception 'Tabla no válida: %', p_tabla;
  end if;
  -- Solo se elimina lo que ya está en la papelera
  execute format('delete from public.%I where id = $1 and deleted_at is not null', p_tabla)
  using p_id;
end;
$$;

grant execute on function public.papelera_mover(text, uuid),
                          public.papelera_restaurar(text, uuid),
                          public.papelera_eliminar(text, uuid) to authenticated;

-- Lista de la papelera (solo devuelve filas al administrador, por RLS)
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
    from public.material_movimientos where deleted_at is not null;
grant select on public.papelera to authenticated;

-- ---------------------------------------------------------------------
-- Tiempo real: los cambios llegan al instante a todos los navegadores
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.clientes, public.contactos, public.intermediarios, public.leads,
  public.oportunidades, public.presupuestos, public.presupuesto_versiones,
  public.cobros, public.eventos, public.evento_montadores, public.inventario,
  public.material_movimientos, public.comerciales, public.tipos_cliente,
  public.tipos_evento, public.canales_lead, public.roles_contacto,
  public.montadores, public.perfiles, public.ajustes, public.historial;
