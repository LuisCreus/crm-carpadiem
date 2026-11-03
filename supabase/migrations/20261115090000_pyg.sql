-- =====================================================================
-- CRM Carpa Diem · 18 · Cuenta de pérdidas y ganancias (Fase 18)
--
--   · activos: el CAPEX (equipos que se amortizan). Las facturas recibidas de
--     «Material de carpas (inversión)» entran solas, con 10 años de vida útil.
--   · pyg_manual: lo que se escribe a mano mes a mes (sueldo del director,
--     bonus, intereses del préstamo de socios), como las celdas azules del Excel.
--   Todos lo ven; solo el administrador lo cambia.
-- =====================================================================

-- La categoría de las compras de material (ya creada a mano en producción)
insert into public.categorias_gasto (codigo, nombre, tipo, orden)
values ('material_carpas', 'Material de carpas (inversión)', 'fijo', 29)
on conflict (codigo) do nothing;

create table public.activos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  coste numeric(12, 2) not null check (coste >= 0),
  vida_anios int not null default 10 check (vida_anios > 0),
  fecha_compra date not null,
  cuota_manual numeric(12, 2) check (cuota_manual >= 0), -- €/mes confirmada por la gestoría
  factura_recibida_id uuid unique references public.facturas_recibidas (id) on delete set null,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
select public.activar_seguimiento('activos');

create table public.pyg_manual (
  id uuid primary key default gen_random_uuid(),
  mes date not null check (extract(day from mes) = 1),
  concepto text not null check (concepto in ('director', 'bonus', 'intereses')),
  importe numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (mes, concepto)
);
select public.activar_seguimiento('pyg_manual');

do $$
declare
  t text;
begin
  foreach t in array array['activos', 'pyg_manual'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy ver on public.%I for select to authenticated using (public.es_usuario_activo())', t);
    execute format('create policy crear on public.%I for insert to authenticated with check (public.es_admin())', t);
    execute format('create policy editar on public.%I for update to authenticated using (public.es_admin()) with check (public.es_admin())', t);
    execute format('create policy eliminar on public.%I for delete to authenticated using (public.es_admin())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;
alter publication supabase_realtime add table public.activos, public.pyg_manual;

-- Facturas de material de carpas → CAPEX (y fuera si cambian de categoría o van a la papelera)
create function public.factura_a_activo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_proveedor text;
begin
  if new.categoria = 'material_carpas' and new.deleted_at is null then
    select nombre into v_proveedor from public.proveedores where id = new.proveedor_id;
    insert into public.activos (nombre, coste, fecha_compra, factura_recibida_id)
    values (coalesce(nullif(new.concepto, ''), 'Material de carpas') || coalesce(' · ' || v_proveedor, '') || coalesce(' nº ' || new.numero, ''),
            new.base, new.fecha, new.id)
    on conflict (factura_recibida_id) do update set coste = excluded.coste, fecha_compra = excluded.fecha_compra;
  else
    delete from public.activos where factura_recibida_id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.factura_a_activo() from public, anon, authenticated;
create trigger factura_a_activo after insert or update of categoria, base, fecha, deleted_at on public.facturas_recibidas
  for each row execute function public.factura_a_activo();

-- CAPEX de la hoja General del Excel contable
insert into public.activos (nombre, coste, vida_anios, fecha_compra, notas) values
  ('2 Carpas beduinas 12×15', 16371.55, 10, '2026-03-01', 'FACT 38 CARPA DIEM IBÉRICA, 26156'),
  ('Herramientas y accesorios (beduinas)', 2109, 10, '2026-03-01', '26157'),
  ('4 Carpas modulares color arena', 15281, 10, '2026-03-01', 'CARPE DIEM- RTO PENDIENTE y CARPE DIEM- FRA RESERVA'),
  ('Tarima carpas modulares', 4900, 10, '2026-03-01', 'CARPA DIEM - TARIMA'),
  ('Traspale', 1794, 10, '2026-03-01', 'TR_Pro-Forma_A-420445'),
  ('Leroy Merlin', 882.26, 5, '2026-03-01', 'invoice (2)'),
  ('Estanterías', 225, 10, '2026-03-01', 'FACT ESTANTERIA carpas'),
  ('Carpa beduina', 10540.8, 10, '2026-05-20', '26156'),
  ('Sombrillas', 38.8, 5, '2026-06-23', null);

-- Las facturas de material de carpas que ya estaban (Artex)
update public.facturas_recibidas set categoria = categoria where categoria = 'material_carpas' and deleted_at is null;

-- Sueldo del director (Excel: 1.100 €/mes de marzo a septiembre de 2026)
insert into public.pyg_manual (mes, concepto, importe)
select m::date, 'director', 1100 from generate_series('2026-03-01'::date, '2026-09-01'::date, interval '1 month') m;
