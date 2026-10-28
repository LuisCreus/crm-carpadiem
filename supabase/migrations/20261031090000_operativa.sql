-- =====================================================================
-- CRM Carpa Diem · 6 · Operativa de eventos
-- =====================================================================

-- Material del inventario reservado para cada evento (para avisar de solapes)
create table public.evento_material (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete cascade,
  inventario_id uuid not null references public.inventario (id) on delete cascade,
  cantidad numeric(10, 2) not null check (cantidad > 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (evento_id, inventario_id)
);
select public.activar_seguimiento('evento_material');

alter table public.evento_material enable row level security;
create policy ver on public.evento_material for select to authenticated using (public.es_usuario_activo());
create policy crear on public.evento_material for insert to authenticated with check (public.es_usuario_activo());
create policy editar on public.evento_material for update to authenticated
  using (public.es_usuario_activo()) with check (public.es_usuario_activo());
create policy eliminar on public.evento_material for delete to authenticated using (public.es_usuario_activo());
grant select, insert, update, delete on public.evento_material to authenticated;
alter publication supabase_realtime add table public.evento_material;

-- Hoja de montaje guardada en SharePoint
alter table public.eventos add column hoja_montaje_item_id text;

-- El nombre del usuario se actualiza con el que manda Microsoft al iniciar sesión
create function public.al_actualizar_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_nombre text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name');
begin
  if v_nombre is not null then
    update public.perfiles set nombre = v_nombre where id = new.id and nombre is distinct from v_nombre;
  end if;
  return new;
end;
$$;
create trigger al_actualizar_usuario
after update of raw_user_meta_data on auth.users
for each row execute function public.al_actualizar_usuario();
