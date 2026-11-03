// Rentabilidad: margen de cada evento y resumen mes a mes (todo sin IVA).
//   · Ingresos: el importe aceptado del presupuesto. Si se canceló quedándonos la reserva, lo retenido.
//     Proyectos de larga duración (Peñalagos): sus facturas emitidas, cada una en su mes.
//   · Gastos: las bases de las facturas recibidas asignadas al evento.
//   · Comisión del intermediario: se resta como prevista hasta que llegue su factura.
//   · Mes: el del evento (como el P&L del Excel). Los de larga duración, el de cada factura.

const redondear = (n: number) => Math.round(n * 100) / 100;

export type EventoRentabilidad = {
  id: string;
  cliente: string;
  estado: "activo" | "cancelado_reserva_retenida" | "cancelado";
  fecha_precision: "dia" | "mes" | "por_definir";
  fecha_inicio: string | null;
  importe: number | null;
  importe_retenido: number | null;
  es_larga_duracion: boolean;
  comision_pct: number | null; // del presupuesto, si hay intermediario
};
export type GastoRentabilidad = { evento_id: string | null; base: number; fecha: string; categoria: string | null };
export type FacturaRentabilidad = { evento_id: string | null; importe: number; estado: string; fecha_emision: string | null };

export type Rentabilidad = {
  ingresos: number;
  gastos: number;
  comisionPrevista: number;
  margen: number;
  margenPct: number | null;
};

export function rentabilidadEvento(e: EventoRentabilidad, gastos: GastoRentabilidad[], facturas: FacturaRentabilidad[]): Rentabilidad {
  const suyos = gastos.filter((g) => g.evento_id === e.id);
  const ingresos = e.es_larga_duracion
    ? facturas.filter((f) => f.evento_id === e.id && f.estado !== "prevista").reduce((s, f) => s + f.importe, 0)
    : e.estado === "cancelado" ? 0
    : e.estado === "cancelado_reserva_retenida" ? e.importe_retenido ?? 0
    : e.importe ?? 0;
  const gastado = suyos.reduce((s, g) => s + g.base, 0);
  const hayFacturaComision = suyos.some((g) => g.categoria === "comisiones");
  const comisionPrevista = !hayFacturaComision && e.estado === "activo" && e.comision_pct ? redondear((e.importe ?? 0) * e.comision_pct / 100) : 0;
  const margen = redondear(ingresos - gastado - comisionPrevista);
  return { ingresos: redondear(ingresos), gastos: redondear(gastado), comisionPrevista, margen, margenPct: ingresos > 0 ? margen / ingresos : null };
}

export type Mes = { clave: string; ingresos: number; gastos: number; margen: number; eventos: number };

// Mes a mes de un año (clave "aaaa-mm"; "sin-fecha" para los eventos sin fecha)
export function resumenMensual(anio: number, eventos: EventoRentabilidad[], gastos: GastoRentabilidad[], facturas: FacturaRentabilidad[],
  anioActual = Number(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }).slice(0, 4))): Mes[] {
  const meses = new Map<string, Mes>();
  const mes = (clave: string) => {
    if (!meses.has(clave)) meses.set(clave, { clave, ingresos: 0, gastos: 0, margen: 0, eventos: 0 });
    return meses.get(clave)!;
  };
  for (let m = 1; m <= 12; m++) mes(`${anio}-${String(m).padStart(2, "0")}`);

  for (const e of eventos) {
    if (e.estado === "cancelado") continue;
    if (e.es_larga_duracion) {
      // Cada mensualidad (y cada gasto) en su mes
      for (const f of facturas.filter((x) => x.evento_id === e.id && x.estado !== "prevista" && x.fecha_emision?.startsWith(String(anio)))) {
        mes(f.fecha_emision!.slice(0, 7)).ingresos += f.importe;
      }
      for (const g of gastos.filter((x) => x.evento_id === e.id && x.fecha.startsWith(String(anio)))) mes(g.fecha.slice(0, 7)).gastos += g.base;
      continue;
    }
    const clave = e.fecha_precision === "por_definir" || !e.fecha_inicio ? "sin-fecha" : e.fecha_inicio.slice(0, 7);
    if (clave !== "sin-fecha" && !clave.startsWith(String(anio))) continue;
    // Los eventos sin fecha cerrada se cuentan solo en el año en curso (no en todos)
    if (clave === "sin-fecha" && anio !== anioActual) continue;
    const r = rentabilidadEvento(e, gastos, facturas);
    const m = mes(clave);
    m.ingresos += r.ingresos;
    m.gastos += r.gastos + r.comisionPrevista;
    m.eventos += 1;
  }
  return [...meses.values()]
    .map((m) => ({ ...m, ingresos: redondear(m.ingresos), gastos: redondear(m.gastos), margen: redondear(m.ingresos - m.gastos) }))
    .sort((a, b) => (a.clave === "sin-fecha" ? 1 : b.clave === "sin-fecha" ? -1 : a.clave.localeCompare(b.clave)));
}

// Trimestre de una fecha ("2026-11-03" → 4)
export const trimestreDe = (fecha: string) => Math.floor((Number(fecha.slice(5, 7)) - 1) / 3) + 1;

export function rangoTrimestre(anio: number, t: number): { desde: string; hasta: string } {
  const mesDesde = (t - 1) * 3 + 1;
  const ultimoDia = new Date(Date.UTC(anio, mesDesde + 2, 0)).getUTCDate();
  return { desde: `${anio}-${String(mesDesde).padStart(2, "0")}-01`, hasta: `${anio}-${String(mesDesde + 2).padStart(2, "0")}-${ultimoDia}` };
}
