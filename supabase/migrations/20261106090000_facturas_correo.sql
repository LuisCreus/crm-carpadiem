-- =====================================================================
-- CRM Carpa Diem · 12 · Enviar facturas por correo (Fase 13)
-- El CRM prepara el borrador en Outlook (con el PDF); se guarda cuándo.
-- =====================================================================

alter table public.facturas
  add column correo_preparado_at timestamptz,
  add column correo_para text;

grant update (correo_preparado_at, correo_para) on public.facturas to authenticated;
