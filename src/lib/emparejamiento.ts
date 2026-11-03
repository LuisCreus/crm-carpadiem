// Revisar que cada gasto y cada factura están con su evento:
//   · gastos de una categoría de evento (montadores, furgoneta…) apuntados como gasto general,
//   · facturas emitidas sin evento,
//   · eventos ya pasados sin ninguna factura de montadores (salvo que se marquen como revisados).

export const CATEGORIA_MONTAJE = "montadores";

export type EventoRevision = {
  id: string; cliente: string; estado: string; fecha_inicio: string | null; es_larga_duracion: boolean; montaje_revisado: boolean;
};
export type GastoRevision = { id: string; evento_id: string | null; categoria: string | null; fecha: string };
export type FacturaRevision = { id: string; evento_id: string | null; estado: string; fecha_emision: string | null };

const dias = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

// Eventos ordenados por cercanía a una fecha (los que tienen fecha primero; los cancelados fuera)
export function eventosCercanos<T extends Pick<EventoRevision, "fecha_inicio" | "estado">>(fecha: string, eventos: T[]): T[] {
  return eventos
    .filter((e) => e.estado !== "cancelado")
    .map((e) => ({ e, d: e.fecha_inicio ? dias(e.fecha_inicio, fecha) : Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.e);
}

export function porRevisar(
  hoy: string,
  eventos: EventoRevision[],
  gastos: GastoRevision[],
  facturas: FacturaRevision[],
  categoriasDeEvento: Set<string>,
) {
  const conMontaje = new Set(gastos.filter((g) => g.categoria === CATEGORIA_MONTAJE && g.evento_id).map((g) => g.evento_id));
  return {
    gastosSinEvento: gastos.filter((g) => !g.evento_id && g.categoria && categoriasDeEvento.has(g.categoria)),
    facturasSinEvento: facturas.filter((f) => !f.evento_id && f.estado !== "prevista"),
    eventosSinMontaje: eventos.filter((e) => e.estado === "activo" && !e.es_larga_duracion && !e.montaje_revisado
      && e.fecha_inicio && e.fecha_inicio < hoy && !conMontaje.has(e.id)),
  };
}
