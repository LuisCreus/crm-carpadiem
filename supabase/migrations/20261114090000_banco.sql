-- =====================================================================
-- CRM Carpa Diem · 17 · Conciliar con el banco (Fase 17)
--
--   · Movimientos del extracto de Santander (se suben a mano: Norma 43 o Excel).
--   · Cada movimiento se concilia con una factura emitida (cobro), con una
--     factura recibida (pago) o se convierte en un gasto; o se ignora.
--   · Reglas: "lo que lleve MICROSOFT en el concepto es Licencias de Microsoft".
-- =====================================================================

create table public.movimientos_banco (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  fecha_valor date,
  concepto text not null,
  importe numeric(12, 2) not null,
  saldo numeric(12, 2),
  referencia text,
  huella text not null unique,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'conciliado', 'ignorado')),
  factura_id uuid references public.facturas (id),
  factura_recibida_id uuid references public.facturas_recibidas (id),
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index movimientos_banco_fecha_idx on public.movimientos_banco (fecha);
select public.activar_seguimiento('movimientos_banco');

create table public.reglas_banco (
  id uuid primary key default gen_random_uuid(),
  patron text not null,
  categoria text references public.categorias_gasto (codigo) on update cascade,
  proveedor_id uuid references public.proveedores (id),
  ignorar boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
select public.activar_seguimiento('reglas_banco');

do $$
declare
  t text;
begin
  foreach t in array array['movimientos_banco', 'reglas_banco'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy ver on public.%I for select to authenticated using (public.es_usuario_activo())', t);
    execute format('create policy crear on public.%I for insert to authenticated with check (public.es_usuario_activo())', t);
    execute format('create policy editar on public.%I for update to authenticated using (public.es_usuario_activo()) with check (public.es_usuario_activo())', t);
    execute format('create policy eliminar on public.%I for delete to authenticated using (public.es_usuario_activo())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

alter publication supabase_realtime add table public.movimientos_banco, public.reglas_banco;
