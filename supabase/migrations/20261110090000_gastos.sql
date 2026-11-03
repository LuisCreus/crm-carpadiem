-- =====================================================================
-- CRM Carpa Diem · 13 · Facturas recibidas y gastos (Fase 14)
--
--   · Proveedores (con su NIF e IBAN, para pagarles después).
--   · Facturas recibidas: se apuntan a mano, con su PDF guardado en
--     03. FINANCIERO/01. FACTURAS/01. PENDIENTE SARA/02. RECIBIDAS.
--   · Cada gasto va a un evento (gasto variable) o es un gasto general.
--   · Estados: Por pagar → Pagada.
-- =====================================================================

-- Categorías de gasto (las del Excel contable: variables por evento y fijos del P&L)
create table public.categorias_gasto (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  tipo text not null check (tipo in ('variable', 'fijo')),
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
select public.activar_seguimiento('categorias_gasto');

insert into public.categorias_gasto (codigo, nombre, tipo, orden) values
  ('montadores', 'Montadores', 'variable', 1),
  ('furgoneta', 'Alquiler de furgoneta', 'variable', 2),
  ('gasolina_evento', 'Gasolina', 'variable', 3),
  ('comisiones', 'Comisiones', 'variable', 4),
  ('alquiler_carpa', 'Alquiler carpa', 'variable', 5),
  ('taxi', 'Taxi', 'variable', 6),
  ('reserva', 'Reserva', 'variable', 7),
  ('otros_evento', 'Otros del evento', 'variable', 8),
  ('almacen', 'Almacén', 'fijo', 20),
  ('mantenimiento', 'Mantenimiento carpa', 'fijo', 21),
  ('seguro', 'Seguro de responsabilidad civil', 'fijo', 22),
  ('web', 'Página web', 'fijo', 23),
  ('ia', 'IA', 'fijo', 24),
  ('gestoria', 'Gestoría', 'fijo', 25),
  ('gasolina', 'Gasolina (general)', 'fijo', 26),
  ('leroy', 'Leroy Merlin', 'fijo', 27),
  ('peajes', 'Peajes', 'fijo', 28),
  ('estanterias', 'Estanterías', 'fijo', 29),
  ('dietas', 'Dietas', 'fijo', 30),
  ('microsoft', 'Licencias de Microsoft', 'fijo', 31),
  ('otros', 'Otros gastos generales', 'fijo', 32);

create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nif text,
  iban text,
  email text,
  telefono text,
  categoria text references public.categorias_gasto (codigo) on update cascade,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);
create index proveedores_nombre_idx on public.proveedores (lower(nombre));
select public.activar_seguimiento('proveedores');

create table public.facturas_recibidas (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid references public.proveedores (id),
  numero text,
  fecha date not null default current_date,
  vencimiento date,
  concepto text,
  evento_id uuid references public.eventos (id),
  categoria text references public.categorias_gasto (codigo) on update cascade,
  base numeric(12, 2) not null check (base >= 0),
  iva_pct numeric(5, 2) not null default 21 check (iva_pct >= 0),
  irpf_pct numeric(5, 2) not null default 0 check (irpf_pct >= 0),
  total numeric(12, 2) generated always as
    (round(base + base * iva_pct / 100 - base * irpf_pct / 100, 2)) stored,
  iban text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'pagada')),
  fecha_pago date,
  archivo_item_id text,
  archivo_url text,
  archivo_nombre text,
  comentarios text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  check ((estado = 'pagada') = (fecha_pago is not null))
);
create index facturas_recibidas_evento_idx on public.facturas_recibidas (evento_id);
create index facturas_recibidas_proveedor_idx on public.facturas_recibidas (proveedor_id);
select public.activar_seguimiento('facturas_recibidas');

alter table public.ajustes
  add column dias_aviso_pago int not null default 3 check (dias_aviso_pago >= 0);

-- ---------------------------------------------------------------------
-- Permisos, papelera y tiempo real
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['proveedores', 'facturas_recibidas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy ver on public.%I for select to authenticated
      using (public.es_usuario_activo() and (deleted_at is null or public.es_admin()))$p$, t);
    execute format($p$create policy crear on public.%I for insert to authenticated
      with check (public.es_usuario_activo() and deleted_at is null)$p$, t);
    execute format($p$create policy editar on public.%I for update to authenticated
      using (public.es_usuario_activo() and deleted_at is null)
      with check (public.es_usuario_activo() and deleted_at is null)$p$, t);
    execute format($p$create policy eliminar on public.%I for delete to authenticated
      using (public.es_admin())$p$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

alter table public.categorias_gasto enable row level security;
create policy ver on public.categorias_gasto for select to authenticated using (public.es_usuario_activo());
create policy crear on public.categorias_gasto for insert to authenticated with check (public.es_admin());
create policy editar on public.categorias_gasto for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy eliminar on public.categorias_gasto for delete to authenticated using (public.es_admin());
grant select, insert, update, delete on public.categorias_gasto to authenticated;

create or replace function public.tablas_con_papelera() returns text[]
language sql immutable as $$
  select array['clientes', 'contactos', 'intermediarios', 'leads', 'oportunidades',
               'presupuestos', 'presupuesto_versiones', 'cobros', 'eventos',
               'inventario', 'material_movimientos', 'facturas', 'proveedores', 'facturas_recibidas'];
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
    from public.facturas where deleted_at is not null
  union all
  select 'proveedores', id, 'Proveedor · ' || nombre, deleted_at, deleted_by
    from public.proveedores where deleted_at is not null
  union all
  select 'facturas_recibidas', r.id, 'Factura recibida · ' || coalesce(p.nombre, '') || ' · ' || r.total::text || ' €', r.deleted_at, r.deleted_by
    from public.facturas_recibidas r left join public.proveedores p on p.id = r.proveedor_id
   where r.deleted_at is not null;

alter publication supabase_realtime add table public.proveedores, public.facturas_recibidas, public.categorias_gasto;
