-- =====================================================================
-- CRM Carpa Diem · 23 · Remesas de transferencias
--
--   · Cada fichero de pagos (remesa) que se descarga recuerda qué facturas lleva.
--   · En el banco, la remesa sale como UN solo cargo por el total: ahora ese
--     movimiento se concilia con todas las facturas de la remesa a la vez.
-- =====================================================================

alter table public.facturas_recibidas add column remesa_id uuid;
alter table public.movimientos_banco add column remesa_id uuid;
create index facturas_recibidas_remesa_idx on public.facturas_recibidas (remesa_id) where remesa_id is not null;

-- Los ficheros ya descargados: las facturas que se metieron en el mismo fichero
-- (mismo instante) forman una remesa.
update public.facturas_recibidas f
   set remesa_id = g.id
  from (select fichero_pago_at, gen_random_uuid() as id
          from public.facturas_recibidas
         where fichero_pago_at is not null
         group by fichero_pago_at) g
 where f.fichero_pago_at = g.fichero_pago_at;
