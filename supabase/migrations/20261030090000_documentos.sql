-- =====================================================================
-- CRM Carpa Diem · 5 · Documentos (Word, PDF y carpetas de SharePoint)
-- =====================================================================

-- Ruta de la carpeta tal y como se creó, para saber si hay que moverla
alter table public.presupuestos add column sp_carpeta_ruta text;

-- Ruta del Word de cada versión (para abrirlo en Word de escritorio)
alter table public.presupuesto_versiones add column docx_ruta text;

-- Plan B: PDF subido a mano (si SharePoint falla), guardado en Supabase Storage
alter table public.presupuesto_versiones add column pdf_storage text;

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

create policy "documentos: ver" on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.es_usuario_activo());
create policy "documentos: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.es_usuario_activo());
create policy "documentos: sustituir" on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and public.es_usuario_activo());

-- ---------------------------------------------------------------------
-- Seguridad: nadie sin sesión puede llamar a las funciones de la base de datos
-- (ya comprobaban dentro quién llama; así ni siquiera se pueden invocar)
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from anon, public;
grant execute on function
  public.es_admin(), public.es_usuario_activo(),
  public.papelera_mover(text, uuid), public.papelera_restaurar(text, uuid), public.papelera_eliminar(text, uuid),
  public.aceptar_presupuesto(uuid, public.modalidad_evento), public.marcar_enviado(uuid, int),
  public.marcar_caducados(), public.crear_presupuesto(jsonb), public.nueva_version(uuid),
  public.estado_pago(numeric, numeric, numeric)
to authenticated;
