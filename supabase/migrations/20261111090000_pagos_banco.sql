-- =====================================================================
-- CRM Carpa Diem · 14 · Pagos con el banco (Fase 15)
-- Las facturas recibidas que van en un fichero de transferencias SEPA
-- se marcan con la fecha del fichero (para no pagarlas dos veces).
-- =====================================================================

alter table public.facturas_recibidas add column fichero_pago_at timestamptz;
