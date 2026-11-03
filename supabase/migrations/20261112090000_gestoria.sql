-- =====================================================================
-- CRM Carpa Diem · 15 · Pasar a la gestoría (Fase 16)
-- Cada factura (emitida o recibida) guarda cuándo se pasó a la gestoría,
-- para no pasarla dos veces. El email de la gestoría es opcional (hay rotación).
-- =====================================================================

alter table public.facturas add column gestoria_at timestamptz;
grant update (gestoria_at) on public.facturas to authenticated;

alter table public.facturas_recibidas add column gestoria_at timestamptz;

alter table public.ajustes add column email_gestoria text;
