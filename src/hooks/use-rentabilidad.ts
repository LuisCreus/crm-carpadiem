"use client";

import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { uno } from "@/lib/datos/tipos";
import type { EventoRentabilidad, FacturaRentabilidad, GastoRentabilidad } from "@/lib/rentabilidad";

export type DatosRentabilidad = {
  eventos: (EventoRentabilidad & { codigo: string | null })[];
  gastos: GastoRentabilidad[];
  facturas: FacturaRentabilidad[];
};

// Eventos, gastos y facturas para calcular la rentabilidad (de uno o de todos los eventos)
export function useRentabilidad(eventoId?: string) {
  const { datos, cargando } = useTablaEnVivo<DatosRentabilidad>(["eventos", "presupuestos", "facturas", "facturas_recibidas"], async (sb) => {
    let ev = sb.from("eventos").select("id, estado, fecha_precision, fecha_inicio, importe, importe_retenido, es_larga_duracion, cliente:clientes(nombre), presupuesto:presupuestos(codigo, comision_pct, intermediario_id)").is("deleted_at", null);
    let ga = sb.from("facturas_recibidas").select("evento_id, base, fecha, categoria").is("deleted_at", null).not("evento_id", "is", null);
    let fa = sb.from("facturas").select("evento_id, importe, estado, fecha_emision").is("deleted_at", null);
    if (eventoId) {
      ev = ev.eq("id", eventoId);
      ga = ga.eq("evento_id", eventoId);
      fa = fa.eq("evento_id", eventoId);
    }
    const [e, g, f] = await Promise.all([ev, ga, fa]);
    for (const r of [e, g, f]) if (r.error) throw new Error(r.error.message);
    return [{
      eventos: (e.data ?? []).map((x) => {
        const p = uno(x.presupuesto) as { codigo: string; comision_pct: number | null; intermediario_id: string | null } | null;
        return {
          id: x.id, estado: x.estado, fecha_precision: x.fecha_precision, fecha_inicio: x.fecha_inicio,
          importe: x.importe !== null ? Number(x.importe) : null,
          importe_retenido: x.importe_retenido !== null ? Number(x.importe_retenido) : null,
          es_larga_duracion: x.es_larga_duracion,
          comision_pct: p?.intermediario_id && p.comision_pct ? Number(p.comision_pct) : null,
          cliente: (uno(x.cliente) as { nombre: string } | null)?.nombre ?? "Evento",
          codigo: p?.codigo ?? null,
        };
      }),
      gastos: (g.data ?? []).map((x) => ({ ...x, base: Number(x.base) })),
      facturas: (f.data ?? []).map((x) => ({ ...x, importe: Number(x.importe) })),
    }];
  });
  return { datos: datos[0] ?? { eventos: [], gastos: [], facturas: [] }, cargando };
}
