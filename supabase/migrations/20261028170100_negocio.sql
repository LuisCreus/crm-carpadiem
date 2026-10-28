-- =====================================================================
-- CRM Carpa Diem · 2/3 · Clientes, leads, presupuestos, eventos y material
--
-- Todas las tablas de negocio llevan:
--   created_at/by, updated_at/by  -> quién y cuándo
--   deleted_at/by                 -> papelera (borrado lógico)
--
-- Preparado para el ERP (no se construye ahora): las facturas, los costes
-- por evento y el margen colgarán de eventos.id y presupuestos.id.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Clientes, contactos e intermediarios
-- ---------------------------------------------------------------------
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo_cliente text references public.tipos_cliente (codigo) on update cascade,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);
create index clientes_nombre_idx on public.clientes (lower(nombre));

create table public.contactos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  nombre text not null,
  rol text references public.roles_contacto (codigo) on update cascade,
  telefono text,
  email text,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);
create index contactos_cliente_idx on public.contactos (cliente_id);

create table public.intermediarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null default 'otro'
    check (tipo in ('wedding_planner', 'finca', 'empresa', 'gilca_sound', 'otro')),
  comision_pct numeric(5, 2) check (comision_pct between 0 and 100),
  contacto_nombre text,
  telefono text,
  email text,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

-- ---------------------------------------------------------------------
-- Leads (prospección)
-- ---------------------------------------------------------------------
create type public.estado_lead as enum (
  'por_contactar', 'contactado', 'interesado', 'presupuesto_enviado', 'ganado', 'perdido');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  comercial_id uuid references public.comerciales (id),
  fecha_primer_contacto date not null default current_date,
  cliente_nombre text not null,
  cliente_id uuid references public.clientes (id),
  contacto_nombre text,
  telefono text,
  email text,
  tipo_cliente text references public.tipos_cliente (codigo) on update cascade,
  canal text references public.canales_lead (codigo) on update cascade,
  fecha_evento_aprox text,
  lugar_aprox text,
  que_pide text,
  proxima_accion_fecha date,
  proxima_accion_texto text,
  comentarios text,
  estado public.estado_lead not null default 'por_contactar',
  orden_kanban double precision not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

-- ---------------------------------------------------------------------
-- Numeración de presupuestos: CD + 3 dígitos, correlativa por año de creación
-- ---------------------------------------------------------------------
create table public.numeracion_anual (
  anio int primary key check (anio between 2020 and 2100),
  -- Primer número del año (configurable por el administrador)
  numero_inicial int not null default 1 check (numero_inicial > 0),
  -- Último número asignado (0 = ninguno todavía)
  ultimo_numero int not null default 0 check (ultimo_numero >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
-- 2026 empieza en el 13 a propósito. [PENDIENTE LUIS: el último número
-- usado (77 o 78) se fija en la importación de la Fase 9]
insert into public.numeracion_anual (anio, numero_inicial) values (2026, 13);

-- Reserva el siguiente número del año. El UPDATE bloquea la fila del año,
-- así que dos personas a la vez nunca reciben el mismo número.
create function public.siguiente_numero_presupuesto(p_anio int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_numero int;
begin
  insert into public.numeracion_anual (anio) values (p_anio)
  on conflict (anio) do nothing;

  update public.numeracion_anual
     set ultimo_numero = greatest(ultimo_numero + 1, numero_inicial)
   where anio = p_anio
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;
revoke execute on function public.siguiente_numero_presupuesto(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Oportunidades (agrupan las opciones de un mismo cliente) y presupuestos
-- ---------------------------------------------------------------------
create table public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  nombre text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

create type public.estado_presupuesto as enum (
  'borrador', 'pendiente', 'aceptado', 'reserva_pagada', 'pagado',
  'rechazado', 'caducado', 'descartada');

-- dia: fecha exacta · mes: solo mes y año (fecha_evento = día 1) · por_definir: sin fecha
create type public.precision_fecha as enum ('dia', 'mes', 'por_definir');

create type public.plantilla_presupuesto as enum ('carpadiem', 'neutra');

create table public.presupuestos (
  id uuid primary key default gen_random_uuid(),
  anio int not null,
  numero int not null check (numero > 0),
  codigo text generated always as ('CD ' || lpad(numero::text, 3, '0')) stored,
  oportunidad_id uuid references public.oportunidades (id),
  cliente_id uuid not null references public.clientes (id),
  lead_id uuid references public.leads (id),
  tipo_evento text references public.tipos_evento (codigo) on update cascade,
  intermediario_id uuid references public.intermediarios (id),
  comision_pct numeric(5, 2) check (comision_pct between 0 and 100),
  fecha_precision public.precision_fecha not null default 'dia',
  fecha_evento date,
  fecha_fin date,
  ubicacion text,
  provincia text,
  material text,
  comercial_id uuid references public.comerciales (id),
  reserva_pct numeric(5, 2) check (reserva_pct between 0 and 100),
  plantilla public.plantilla_presupuesto not null default 'carpadiem',
  estado public.estado_presupuesto not null default 'borrador',
  motivo_rechazo text,
  -- Total sin IVA (leído del PDF y confirmado, o escrito a mano)
  importe numeric(12, 2) check (importe >= 0),
  enviado_at timestamptz,
  version_enviada int,
  -- SharePoint (Fase 4)
  sp_carpeta_id text,
  sp_carpeta_url text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  unique (anio, numero),
  check (fecha_precision = 'por_definir' or fecha_evento is not null),
  check (fecha_fin is null or fecha_evento is null or fecha_fin >= fecha_evento)
);
create index presupuestos_cliente_idx on public.presupuestos (cliente_id);
create index presupuestos_fecha_idx on public.presupuestos (fecha_evento);
create index presupuestos_estado_idx on public.presupuestos (estado);

-- Asigna año y número al crear (salvo que la importación los traiga ya)
create function public.numerar_presupuesto() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.numero is null then
    new.anio := extract(year from (now() at time zone 'Europe/Madrid'))::int;
    new.numero := public.siguiente_numero_presupuesto(new.anio);
  elsif new.anio is null then
    raise exception 'Si se indica el número, hay que indicar también el año';
  end if;
  return new;
end;
$$;
create trigger numerar_presupuesto
before insert on public.presupuestos
for each row execute function public.numerar_presupuesto();

create table public.presupuesto_versiones (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos (id) on delete cascade,
  version int not null check (version between 1 and 99),
  nombre_archivo text,
  docx_item_id text,
  docx_url text,
  pdf_item_id text,
  pdf_url text,
  importe numeric(12, 2) check (importe >= 0),
  pdf_generado_at timestamptz,
  enviado_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  unique (presupuesto_id, version)
);

create type public.concepto_cobro as enum ('reserva', 'resto', 'otro');

create table public.cobros (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos (id),
  fecha date not null default current_date,
  importe numeric(12, 2) not null check (importe > 0),
  concepto public.concepto_cobro not null default 'reserva',
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);
create index cobros_presupuesto_idx on public.cobros (presupuesto_id);

-- ---------------------------------------------------------------------
-- Eventos, montaje e inventario
-- ---------------------------------------------------------------------
create type public.modalidad_evento as enum ('confirmado', 'seguro');
create type public.estado_evento as enum ('activo', 'cancelado_reserva_retenida', 'cancelado');

create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid unique references public.presupuestos (id),
  cliente_id uuid not null references public.clientes (id),
  tipo_evento text references public.tipos_evento (codigo) on update cascade,
  intermediario_id uuid references public.intermediarios (id),
  fecha_inicio date,
  fecha_fin date,
  ubicacion text,
  provincia text,
  maps_url text,
  material text,
  importe numeric(12, 2) check (importe >= 0),
  modalidad public.modalidad_evento not null default 'confirmado',
  estado public.estado_evento not null default 'activo',
  importe_retenido numeric(12, 2) check (importe_retenido >= 0),
  contacto_destino_id uuid references public.contactos (id),
  montaje_inicio timestamptz,
  montaje_fin timestamptz,
  desmontaje_inicio timestamptz,
  desmontaje_fin timestamptz,
  observaciones_montaje text,
  comentarios text,
  hoja_montaje_url text,
  es_larga_duracion boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  check (fecha_fin is null or fecha_inicio is null or fecha_fin >= fecha_inicio)
);
create index eventos_fecha_idx on public.eventos (fecha_inicio);

create table public.evento_montadores (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete cascade,
  montador_id uuid not null references public.montadores (id),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (evento_id, montador_id)
);

create type public.propiedad_material as enum ('propio', 'subalquilado');

create table public.inventario (
  id uuid primary key default gen_random_uuid(),
  material text not null unique,
  cantidad numeric(10, 2) not null default 0 check (cantidad >= 0),
  unidad text not null default 'ud',
  propiedad public.propiedad_material not null default 'propio',
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

create type public.sentido_material as enum ('sale', 'entra');

create table public.material_movimientos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete cascade,
  inventario_id uuid references public.inventario (id),
  material text not null,
  cantidad numeric(10, 2) not null check (cantidad > 0),
  sentido public.sentido_material not null,
  fecha date,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);
create index material_movimientos_evento_idx on public.material_movimientos (evento_id);

-- ---------------------------------------------------------------------
-- Auditoría + historial en todas las tablas de negocio
-- ---------------------------------------------------------------------
select public.activar_seguimiento(t)
from unnest(array['clientes', 'contactos', 'intermediarios', 'leads', 'oportunidades',
                  'presupuestos', 'presupuesto_versiones', 'cobros', 'eventos',
                  'evento_montadores', 'inventario', 'material_movimientos']) as t;
select public.activar_seguimiento('numeracion_anual', false);
