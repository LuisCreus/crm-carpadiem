-- =====================================================================
-- CRM Carpa Diem · 24 · Socios
--
--   · Pueden entrar unas direcciones concretas de fuera de Carpa Diem (los socios),
--     invitadas como invitados en Microsoft. Ajustes → emails_socios.
--   · Un socio ve todo y edita todo, salvo facturas, gastos, cobros, banco y
--     finanzas, que solo puede ver.
-- =====================================================================

alter table public.ajustes add column emails_socios text[] not null default '{}';
update public.ajustes set emails_socios = array[
  'jimena@lamaraca.com', 'maca@lamaraca.com', 'alvaro@mesonero-romanos.com', 'amparo@mesonero-romanos.com'];

alter table public.perfiles add column es_socio boolean not null default false;

create function public.es_socio() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo and es_socio);
$$;
grant execute on function public.es_socio() to authenticated;

-- Al entrar por primera vez: dominio permitido o socio de la lista
create or replace function public.al_crear_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(new.email);
  v_dominio text := split_part(lower(new.email), '@', 2);
  v_ajustes public.ajustes;
  v_socio boolean;
begin
  if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'azure' then
    raise exception 'SOLO_MICROSOFT: hay que entrar con la cuenta de Microsoft';
  end if;
  select * into v_ajustes from public.ajustes where id;
  v_socio := v_email = any (select lower(x) from unnest(v_ajustes.emails_socios) x);
  if v_email is null or not (v_dominio = any (v_ajustes.dominios_permitidos) or v_socio) then
    raise exception 'DOMINIO_NO_PERMITIDO: %', coalesce(v_dominio, '(sin email)');
  end if;

  insert into public.perfiles (id, email, nombre, rol, es_socio)
  values (
    new.id,
    v_email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    case when v_email = any (v_ajustes.emails_admin) then 'admin'::public.rol_usuario
         else 'usuario'::public.rol_usuario end,
    v_socio
  );
  return new;
end;
$$;

-- Facturas, gastos y cobros: un socio no los crea, cambia ni borra (ni con los botones
-- de emitir o pagar). Lo que cambia solo por otro cambio (p. ej. el plan de facturas
-- al cambiar el importe de un presupuesto) sí sigue funcionando.
create function public.solo_lectura_socio() returns trigger
language plpgsql set search_path = '' as $$
begin
  if pg_trigger_depth() = 1 and public.es_socio() then
    raise exception 'SOLO_LECTURA: los socios pueden ver las facturas y las finanzas, pero no cambiarlas';
  end if;
  return coalesce(new, old);
end;
$$;
do $$
declare
  t text;
begin
  foreach t in array array['facturas', 'facturas_recibidas', 'cobros', 'movimientos_banco', 'reglas_banco', 'activos', 'pyg_manual', 'kit_material'] loop
    if to_regclass('public.' || t) is not null then
      execute format('create trigger solo_lectura_socio before insert or update or delete on public.%I
        for each row execute function public.solo_lectura_socio()', t);
    end if;
  end loop;
end;
$$;

-- Banco, equipos y datos a mano de la P&L: el administrador y los socios los ven
do $$
declare
  t text;
begin
  foreach t in array array['movimientos_banco', 'reglas_banco', 'activos', 'pyg_manual'] loop
    execute format('drop policy ver on public.%I', t);
    execute format('create policy ver on public.%I for select to authenticated using (public.es_admin() or public.es_socio())', t);
  end loop;
end;
$$;
