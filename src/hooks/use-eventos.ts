"use client";

import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { SELECT_EVENTO, uno, type Evento } from "@/lib/datos/tipos";

export type EventoConCobros = Evento & { cobrado: number };

// Eventos (no borrados) con lo cobrado de su presupuesto, siempre al día
export function useEventos() {
  return useTablaEnVivo<EventoConCobros>(["eventos", "cobros", "presupuestos", "clientes"], async (sb) => {
    const [ev, co] = await Promise.all([
      sb.from("eventos").select(SELECT_EVENTO).is("deleted_at", null).order("fecha_inicio", { nullsFirst: false }),
      sb.from("cobros").select("presupuesto_id, importe").is("deleted_at", null),
    ]);
    if (ev.error) throw new Error(ev.error.message);
    const cobrado = new Map<string, number>();
    for (const c of co.data ?? []) {
      cobrado.set(c.presupuesto_id, (cobrado.get(c.presupuesto_id) ?? 0) + Number(c.importe));
    }
    return (ev.data ?? []).map((e) => ({
      ...e,
      importe: e.importe !== null ? Number(e.importe) : null,
      cliente: uno(e.cliente),
      presupuesto: uno(e.presupuesto),
      cobrado: e.presupuesto_id ? cobrado.get(e.presupuesto_id) ?? 0 : 0,
    })) as EventoConCobros[];
  });
}

// Texto corto de cobro: "cobrado", "faltan 2.150 €"…
export function textoCobro(e: EventoConCobros, formato: (n: number) => string): { texto: string; completo: boolean } {
  if (e.importe === null) return { texto: "sin importe", completo: false };
  const falta = e.importe - e.cobrado;
  if (falta <= 0) return { texto: "cobrado", completo: true };
  if (e.cobrado > 0) return { texto: `faltan ${formato(falta)}`, completo: false };
  return { texto: `pendiente ${formato(e.importe)}`, completo: false };
}
