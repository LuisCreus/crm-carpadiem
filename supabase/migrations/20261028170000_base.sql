-- =====================================================================
-- CRM Carpa Diem · 1/3 · Base: ajustes, usuarios, listas e historial
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ajustes generales (una sola fila). Solo el administrador los cambia.
-- ---------------------------------------------------------------------
create table public.ajustes (
  id boolean primary key default true check (id),
  -- Dominios de email que pueden entrar con Microsoft (sin la @).
  dominios_permitidos text[] not null default array['carpa-diem.com'],
  -- Emails que reciben el rol de administrador al entrar por primera vez.
  emails_admin text[] not null default array['lcreus@carpa-diem.com'],
  dias_seguimiento int not null default 7 check (dias_seguimiento > 0),
  dias_limite_seguro int not null default 10 check (dias_limite_seguro >= 0),
  dias_aviso_seguro int not null default 3 check (dias_aviso_seguro >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.ajustes default values;

-- ---------------------------------------------------------------------
-- Usuarios (perfil de cada cuenta de Microsoft que entra al CRM)
-- ---------------------------------------------------------------------
create type public.rol_usuario as enum ('admin', 'usuario');

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  nombre text,
  rol public.rol_usuario not null default 'usuario',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create function public.es_usuario_activo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles where id = auth.uid() and activo
  );
$$;

create function public.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles where id = auth.uid() and activo and rol = 'admin'
  );
$$;

-- Al entrar alguien por primera vez con Microsoft: comprobar el dominio
-- y crear su perfil. Si el dominio no está permitido, el alta se cancela.
create function public.al_crear_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(new.email);
  v_dominio text := split_part(lower(new.email), '@', 2);
  v_ajustes public.ajustes;
begin
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

create trigger al_crear_usuario
after insert on auth.users
for each row execute function public.al_crear_usuario();

-- ---------------------------------------------------------------------
-- Columnas comunes: quién y cuándo creó o cambió cada registro
-- ---------------------------------------------------------------------
create function public.poner_auditoria() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- Versión para tablas sin created_* (ajustes, perfiles, numeración)
create function public.poner_actualizacion() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Historial de cambios: quién cambió qué y cuándo, en cada registro
-- ---------------------------------------------------------------------
create table public.historial (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id text not null,
  accion text not null check (accion in ('crear', 'editar', 'borrar', 'restaurar', 'eliminar')),
  usuario_id uuid,
  usuario_email text,
  fecha timestamptz not null default now(),
  -- En "editar": { campo: { antes, despues } }
  cambios jsonb,
  -- En "crear" y "eliminar": el registro completo
  datos jsonb
);
create index historial_registro_idx on public.historial (tabla, registro_id, fecha desc);

create function public.registrar_historial() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_cambios jsonb := '{}'::jsonb;
  v_accion text;
  v_email text;
  k text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_accion := 'crear';
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    for k in select jsonb_object_keys(v_new) loop
      if k not in ('created_at', 'created_by', 'updated_at', 'updated_by')
         and (v_new -> k) is distinct from (v_old -> k) then
        v_cambios := v_cambios || jsonb_build_object(
          k, jsonb_build_object('antes', v_old -> k, 'despues', v_new -> k));
      end if;
    end loop;
    if v_cambios = '{}'::jsonb then
      return null;
    end if;
    v_accion := case
      when v_old ->> 'deleted_at' is null and v_new ->> 'deleted_at' is not null then 'borrar'
      when v_old ->> 'deleted_at' is not null and v_new ->> 'deleted_at' is null then 'restaurar'
      else 'editar' end;
  else
    v_old := to_jsonb(old);
    v_accion := 'eliminar';
  end if;

  select email into v_email from public.perfiles where id = auth.uid();

  insert into public.historial (tabla, registro_id, accion, usuario_id, usuario_email, cambios, datos)
  values (
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'anio', v_old ->> 'anio'),
    v_accion,
    auth.uid(),
    v_email,
    nullif(v_cambios, '{}'::jsonb),
    case tg_op when 'INSERT' then v_new when 'DELETE' then v_old end
  );
  return null;
end;
$$;

-- Atajo para enganchar auditoría + historial a una tabla
create function public.activar_seguimiento(p_tabla text, p_columnas_completas boolean default true)
returns void language plpgsql set search_path = '' as $$
begin
  execute format(
    'create trigger poner_auditoria before insert or update on public.%I
       for each row execute function public.%I()',
    p_tabla, case when p_columnas_completas then 'poner_auditoria' else 'poner_actualizacion' end);
  execute format(
    'create trigger registrar_historial after insert or update or delete on public.%I
       for each row execute function public.registrar_historial()',
    p_tabla);
end;
$$;

select public.activar_seguimiento('ajustes', false);
select public.activar_seguimiento('perfiles', false);

-- ---------------------------------------------------------------------
-- Listas editables por el administrador
-- ---------------------------------------------------------------------
create table public.comerciales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  perfil_id uuid references public.perfiles (id) on delete set null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.tipos_cliente (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  -- % de reserva por defecto [PENDIENTE LUIS: valores]
  reserva_pct numeric(5, 2) check (reserva_pct between 0 and 100),
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.tipos_evento (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.canales_lead (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.roles_contacto (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.montadores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  telefono text,
  notas text,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

select public.activar_seguimiento(t)
from unnest(array['comerciales', 'tipos_cliente', 'tipos_evento', 'canales_lead',
                  'roles_contacto', 'montadores']) as t;

insert into public.comerciales (nombre, orden) values
  ('Álvaro', 1), ('Amparo', 2), ('Jimena', 3), ('Macarena', 4), ('Felipe', 5),
  ('Diego', 6), ('Jorge', 7), ('Pedro', 8), ('Luis', 9);

insert into public.tipos_cliente (codigo, nombre, orden) values
  ('particular', 'Particular', 1),
  ('empresa', 'Empresa', 2),
  ('wedding_planner', 'Wedding planner', 3),
  ('finca', 'Finca', 4),
  ('ayuntamiento', 'Ayuntamiento', 5),
  ('otro', 'Otro', 6);

insert into public.tipos_evento (codigo, nombre, orden) values
  ('boda', 'Boda', 1),
  ('preboda', 'Preboda', 2),
  ('comunion', 'Comunión', 3),
  ('fiesta', 'Fiesta/cumpleaños', 4),
  ('corporativo', 'Corporativo', 5),
  ('larga_duracion', 'Proyecto de larga duración', 6),
  ('otro', 'Otro', 7);

insert into public.canales_lead (codigo, nombre, orden) values
  ('llamada', 'Llamada', 1),
  ('email', 'Email', 2),
  ('whatsapp', 'WhatsApp', 3),
  ('feria', 'Feria', 4),
  ('referido', 'Referido', 5),
  ('web', 'Web', 6),
  ('gilca_sound', 'Gilca Sound', 7);

insert into public.roles_contacto (codigo, nombre, orden) values
  ('novios', 'Novio/a', 1),
  ('familia', 'Familia', 2),
  ('wedding_planner', 'Wedding planner', 3),
  ('finca', 'Finca', 4),
  ('empresa', 'Empresa', 5),
  ('otro', 'Otro', 6);

insert into public.montadores (nombre, notas, orden) values
  ('David Mendoza', 'Montador autónomo', 1);
