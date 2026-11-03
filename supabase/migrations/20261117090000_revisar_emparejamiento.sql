-- =====================================================================
-- CRM Carpa Diem · 20 · Revisar el emparejamiento de gastos con eventos
--
--   · montaje_revisado: el evento ya pasó y no tiene factura de montadores
--     porque lo montamos nosotros (o no hacía falta). Así deja de salir en
--     «Revisar emparejamiento» de Finanzas.
-- =====================================================================

alter table public.eventos add column montaje_revisado boolean not null default false;
