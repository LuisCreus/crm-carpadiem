-- =====================================================================
-- CRM Carpa Diem · 10 · PDF de las facturas (Fase 12)
-- El PDF se genera con la plantilla de la hoja "Emitir" y se guarda en
-- 03. FINANCIERO/01. FACTURAS/01. PENDIENTE SARA/01. EMITIDAS
-- =====================================================================

alter table public.facturas
  add column pdf_item_id text,
  add column pdf_url text,
  add column pdf_nombre text;

grant update (pdf_item_id, pdf_url, pdf_nombre) on public.facturas to authenticated;
