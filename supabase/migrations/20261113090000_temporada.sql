-- =====================================================================
-- CRM Carpa Diem · 16 · Carpas de temporada (Peñalagos)
-- Cuotas mensuales por tramos: [{"desde": "aaaa-mm", "importe": 670}, …]
-- La temporada son las fechas de inicio y fin del evento.
-- =====================================================================

alter table public.eventos add column cuotas jsonb not null default '[]'::jsonb;

-- Peñalagos 2026: puesta de junio a noviembre, 670 €/mes (los cambios de cuota se editan en el evento)
update public.eventos
   set fecha_precision = 'dia', fecha_inicio = '2026-06-01', fecha_fin = '2026-11-30',
       cuotas = '[{"desde": "2026-06", "importe": 670}]'::jsonb
 where es_larga_duracion and deleted_at is null and fecha_inicio is null;
