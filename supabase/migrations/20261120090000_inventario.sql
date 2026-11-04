-- =====================================================================
-- CRM Carpa Diem · 23 · Inventario integrado
--
--   · Cada presupuesto dice cuántas carpas beduinas, modulares, m² de tarima y
--     sombrillas lleva (se rellena leyendo el texto del material y se corrige a mano).
--   · El inventario (Excel «Inventario Carpa Diem»): las piezas de cada carpa. Cuatro
--     filas marcan cuánto hay de lo grande (3 beduinas, 4 modulares, 72 m² de tarima,
--     5 sombrillas) para avisar si un día se vende más de lo que hay.
--   · Kits: qué piezas lleva UNA carpa (o un m² de tarima). Salen en la hoja de montaje
--     y en la lista de lo que hay que preparar en el almacén.
-- =====================================================================

alter table public.presupuestos
  add column uds_beduinas int not null default 0 check (uds_beduinas >= 0),
  add column uds_modulares int not null default 0 check (uds_modulares >= 0),
  add column m2_tarima numeric(8, 2) not null default 0 check (m2_tarima >= 0),
  add column uds_sombrillas int not null default 0 check (uds_sombrillas >= 0);

alter table public.inventario
  add column grupo text,
  add column orden int not null default 0,
  -- Esta fila dice cuánto hay de lo grande; "equivale": 1 plancha 2x1 = 2 m² de tarima
  add column recurso text unique check (recurso in ('beduinas', 'modulares', 'tarima_m2', 'sombrillas')),
  add column equivale numeric(10, 4) not null default 1 check (equivale > 0);

create table public.kit_material (
  id uuid primary key default gen_random_uuid(),
  recurso text not null check (recurso in ('beduinas', 'modulares', 'tarima_m2', 'sombrillas')),
  inventario_id uuid not null references public.inventario (id) on delete cascade,
  por_unidad numeric(10, 4) not null check (por_unidad > 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (recurso, inventario_id)
);
select public.activar_seguimiento('kit_material');
alter table public.kit_material enable row level security;
create policy ver on public.kit_material for select to authenticated using (public.es_usuario_activo());
create policy crear on public.kit_material for insert to authenticated with check (public.es_admin());
create policy editar on public.kit_material for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy eliminar on public.kit_material for delete to authenticated using (public.es_admin());
grant select, insert, update, delete on public.kit_material to authenticated;
alter publication supabase_realtime add table public.kit_material;

-- Inventario del Excel
insert into public.inventario (material, cantidad, grupo, orden, recurso, equivale) values
  ('Carpas beduinas 12x15', 3, 'Carpas beduinas', 1, 'beduinas', 1),
  ('Canalón 17 metros x 0,7 metros', 2, 'Carpas beduinas', 2, null, 1),
  ('Carracas cincha lateral', 4, 'Carpas beduinas', 3, null, 1),
  ('Cincha lateral', 4, 'Carpas beduinas', 4, null, 1),
  ('Bobinas de cabo', 3, 'Carpas beduinas', 5, null, 1),
  ('Postes de madera 2,5 metros', 12, 'Carpas beduinas', 6, null, 1),
  ('Postes de madera 3 metros', 23, 'Carpas beduinas', 7, null, 1),
  ('Postes de aluminio 3 metros', 9, 'Carpas beduinas', 8, null, 1),
  ('Postes de aluminio 2 metros', 4, 'Carpas beduinas', 9, null, 1),
  ('Postes de aluminio 1,5 metros', 4, 'Carpas beduinas', 10, null, 1),
  ('Uniones aluminio', 6, 'Carpas beduinas', 11, null, 1),
  ('Capotas 6x6', 4, 'Carpas modulares', 20, 'modulares', 1),
  ('Fundas patas', 16, 'Carpas modulares', 21, null, 1),
  ('Paredes 3x3', 32, 'Carpas modulares', 22, null, 1),
  ('Fundas travesaños 4 metros', 32, 'Carpas modulares', 23, null, 1),
  ('Canalones 6 metros PVC', 3, 'Carpas modulares', 24, null, 1),
  ('Fundas para transportar carpas', 4, 'Carpas modulares', 25, null, 1),
  ('Codos', 16, 'Carpas modulares', 26, null, 1),
  ('Patas', 16, 'Carpas modulares', 27, null, 1),
  ('Uniones travesaños', 4, 'Carpas modulares', 28, null, 1),
  ('Palos travesaños', 16, 'Carpas modulares', 29, null, 1),
  ('Palos para montar', 4, 'Carpas modulares', 30, null, 1),
  ('Palos de patas 2,5 metros', 16, 'Carpas modulares', 31, null, 1),
  ('Palos perímetro', 16, 'Carpas modulares', 32, null, 1),
  ('Plancha de tarima 2x1', 36, 'Tarima', 40, 'tarima_m2', 2),
  ('Sombrillas', 5, 'Sombrillas', 50, 'sombrillas', 1)
on conflict (material) do nothing;

-- Kits propuestos: lo que hay en el almacén repartido entre las carpas que hay (se corrigen en Inventario)
insert into public.kit_material (recurso, inventario_id, por_unidad)
select k.recurso, i.id, k.por_unidad
  from (values
    ('beduinas', 'Carpas beduinas 12x15', 1.0), ('beduinas', 'Canalón 17 metros x 0,7 metros', 2.0 / 3),
    ('beduinas', 'Carracas cincha lateral', 4.0 / 3), ('beduinas', 'Cincha lateral', 4.0 / 3),
    ('beduinas', 'Bobinas de cabo', 1.0), ('beduinas', 'Postes de madera 2,5 metros', 4.0),
    ('beduinas', 'Postes de madera 3 metros', 23.0 / 3), ('beduinas', 'Postes de aluminio 3 metros', 3.0),
    ('beduinas', 'Postes de aluminio 2 metros', 4.0 / 3), ('beduinas', 'Postes de aluminio 1,5 metros', 4.0 / 3),
    ('beduinas', 'Uniones aluminio', 2.0),
    ('modulares', 'Capotas 6x6', 1.0), ('modulares', 'Fundas patas', 4.0), ('modulares', 'Paredes 3x3', 8.0),
    ('modulares', 'Fundas travesaños 4 metros', 8.0), ('modulares', 'Canalones 6 metros PVC', 0.75),
    ('modulares', 'Fundas para transportar carpas', 1.0), ('modulares', 'Codos', 4.0), ('modulares', 'Patas', 4.0),
    ('modulares', 'Uniones travesaños', 1.0), ('modulares', 'Palos travesaños', 4.0), ('modulares', 'Palos para montar', 1.0),
    ('modulares', 'Palos de patas 2,5 metros', 4.0), ('modulares', 'Palos perímetro', 4.0),
    ('tarima_m2', 'Plancha de tarima 2x1', 0.5),
    ('sombrillas', 'Sombrillas', 1.0)
  ) as k (recurso, material, por_unidad)
  join public.inventario i on i.material = k.material
on conflict (recurso, inventario_id) do nothing;
