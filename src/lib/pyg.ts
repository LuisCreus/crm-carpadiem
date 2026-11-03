// Cuenta de pérdidas y ganancias (P&L) de un año, mes a mes, como la hoja "P&L" del Excel.
// Todo por fecha de factura: lo facturado y lo que nos facturan cada mes, haya sido cuando haya sido el evento.
//   · Ingresos: la base de cada factura emitida en el mes de su emisión (sin suplidos), por tipo de evento.
//   · Costes variables: las facturas recibidas de un evento (o de categoría variable), en su mes.
//   · Costes fijos: gastos generales en el mes de su factura. El material de carpas no: es CAPEX.
//   · Personal: el sueldo del director son las facturas de su categoría (Maketa); el bonus, a mano.
//   · Intereses: a mano. Amortización: cada activo desde su mes de compra.
//   · IS: 15 % hasta 2027 y 25 % desde 2028, sobre el beneficio acumulado del año.

import type { EventoRentabilidad, FacturaRentabilidad } from "@/lib/rentabilidad";

const redondear = (n: number) => Math.round(n * 100) / 100;
export const CATEGORIA_CAPEX = "material_carpas";
export const CATEGORIA_DIRECTOR = "director";

export type EventoPyg = EventoRentabilidad & { tipo_evento: string | null };
export type GastoPyg = { evento_id: string | null; base: number; fecha: string; categoria: string | null };
export type Activo = { id: string; nombre: string; coste: number; vida_anios: number; fecha_compra: string; cuota_manual: number | null };
export type Manual = { mes: string; concepto: "director" | "bonus" | "intereses"; importe: number };
export type Nombres = { tiposEvento: Map<string, string>; categorias: Map<string, { nombre: string; tipo: string }> };

export type Fila = { clave: string; nombre: string; meses: number[]; total: number };
export type Pyg = {
  ingresos: Fila; porTipo: Fila[];
  variables: Fila; porVariable: Fila[];
  margenBruto: Fila;
  fijos: Fila; porFijo: Fila[];
  personal: Fila; director: Fila; bonus: Fila;
  ebitda: Fila; amortizacion: Fila; ebit: Fila; intereses: Fila; ebt: Fila; impuesto: Fila; neto: Fila;
  tipoImpuesto: number;
};

const ceros = () => Array<number>(12).fill(0);
const fila = (clave: string, nombre: string, meses = ceros()): Fila => {
  const m = meses.map(redondear);
  return { clave, nombre, meses: m, total: redondear(m.reduce((s, x) => s + x, 0)) };
};
const restar = (clave: string, nombre: string, a: Fila, ...b: Fila[]) => fila(clave, nombre, a.meses.map((x, i) => b.reduce((s, f) => s - f.meses[i], x)));

// Las líneas de la P&L en orden, con su detalle (para el Excel de la copia de seguridad)
export function lineasPyg(p: Pyg): { concepto: string; nivel: 0 | 1; fila: Fila }[] {
  const l = (fila: Fila, nivel: 0 | 1 = 0) => ({ concepto: fila.nombre, nivel, fila });
  return [
    l(p.ingresos), ...p.porTipo.map((f) => l(f, 1)),
    l(p.variables), ...p.porVariable.map((f) => l(f, 1)),
    l(p.margenBruto),
    l(p.fijos), ...p.porFijo.map((f) => l(f, 1)),
    l(p.personal), l(p.director, 1), l(p.bonus, 1),
    l(p.ebitda), l(p.amortizacion), l(p.ebit), l(p.intereses), l(p.ebt), l(p.impuesto), l(p.neto),
  ];
}

// Cuota mensual de un activo en un mes ("aaaa-mm"): desde su mes de compra, durante su vida útil
export function cuotaActivo(a: Activo, mes: string): number {
  const [ai, mi] = [Number(a.fecha_compra.slice(0, 4)), Number(a.fecha_compra.slice(5, 7))];
  const transcurridos = (Number(mes.slice(0, 4)) - ai) * 12 + (Number(mes.slice(5, 7)) - mi);
  if (transcurridos < 0 || transcurridos >= a.vida_anios * 12) return 0;
  return a.cuota_manual ?? a.coste / a.vida_anios / 12;
}

export const tipoImpuesto = (anio: number) => (anio <= 2027 ? 0.15 : 0.25);

export function calcularPyg(anio: number, eventos: EventoPyg[], gastos: GastoPyg[], facturas: FacturaRentabilidad[], activos: Activo[], manual: Manual[], nombres: Nombres): Pyg {
  const delAnio = (fecha: string | null) => Boolean(fecha?.startsWith(`${anio}-`));
  const indice = (fecha: string) => Number(fecha.slice(5, 7)) - 1;
  const grupos = () => new Map<string, number[]>();
  const sumar = (g: Map<string, number[]>, clave: string, i: number, importe: number) => {
    if (!g.has(clave)) g.set(clave, ceros());
    g.get(clave)![i] += importe;
  };
  const ingresos = grupos(), variables = grupos(), fijos = grupos();
  const sueldo = ceros();
  const nombreCategoria = (c: string | null) => (c ? nombres.categorias.get(c)?.nombre ?? c : "Sin categoría");

  const tipoDe = new Map(eventos.map((e) => [e.id, e.tipo_evento]));
  for (const f of facturas) {
    if (f.estado === "prevista" || !delAnio(f.fecha_emision)) continue;
    sumar(ingresos, (f.evento_id && tipoDe.get(f.evento_id)) || "otro", indice(f.fecha_emision!), f.importe);
  }

  for (const g of gastos) {
    if (g.categoria === CATEGORIA_CAPEX || !delAnio(g.fecha)) continue;
    if (g.categoria === CATEGORIA_DIRECTOR) { sueldo[indice(g.fecha)] += g.base; continue; }
    const esVariable = g.evento_id ? true : nombres.categorias.get(g.categoria ?? "")?.tipo === "variable";
    sumar(esVariable ? variables : fijos, g.categoria ?? "sin", indice(g.fecha), g.base);
  }

  const aFilas = (g: Map<string, number[]>, nombre: (c: string) => string) =>
    [...g.entries()].map(([c, m]) => fila(c, nombre(c), m)).filter((f) => f.total !== 0 || f.meses.some((x) => x)).sort((a, b) => b.total - a.total);
  const total = (clave: string, nombre: string, filas: Fila[]) => fila(clave, nombre, ceros().map((_, i) => filas.reduce((s, f) => s + f.meses[i], 0)));
  const aMano = (concepto: Manual["concepto"]) => {
    const m = ceros();
    for (const x of manual) if (x.concepto === concepto && delAnio(x.mes)) m[indice(x.mes)] += x.importe;
    return m;
  };

  const porTipo = aFilas(ingresos, (c) => nombres.tiposEvento.get(c) ?? (c === "otro" ? "Sin tipo" : c));
  const porVariable = aFilas(variables, (c) => (c === "sin" ? "Sin categoría" : nombreCategoria(c)));
  const porFijo = aFilas(fijos, (c) => (c === "sin" ? "Sin categoría" : nombreCategoria(c)));
  const tIngresos = total("ingresos", "Ingresos", porTipo);
  const tVariables = total("variables", "Costes variables", porVariable);
  const margenBruto = restar("margen", "Margen bruto", tIngresos, tVariables);
  const tFijos = total("fijos", "Costes fijos", porFijo);
  const director = fila("director", "Director", sueldo);
  const bonus = fila("bonus", "Bonus director", aMano("bonus"));
  const personal = total("personal", "Costes de personal", [director, bonus]);
  const ebitda = restar("ebitda", "EBITDA", margenBruto, tFijos, personal);
  const amortizacion = fila("amortizacion", "Amortización (equipos)", ceros().map((_, i) =>
    activos.reduce((s, a) => s + cuotaActivo(a, `${anio}-${String(i + 1).padStart(2, "0")}`), 0)));
  const ebit = restar("ebit", "EBIT", ebitda, amortizacion);
  const intereses = fila("intereses", "Intereses préstamo socios", aMano("intereses"));
  const ebt = restar("ebt", "Beneficio antes de impuestos", ebit, intereses);

  // IS sobre el acumulado: los meses con pérdidas compensan los siguientes y la suma es la del año
  const tipo = tipoImpuesto(anio);
  let acumulado = 0, pagado = 0;
  const impuesto = fila("impuesto", `Impuesto de sociedades (${tipo * 100} %)`, ebt.meses.map((x) => {
    acumulado += x;
    const debido = Math.max(0, acumulado) * tipo;
    const mes = debido - pagado;
    pagado = debido;
    return mes;
  }));
  const neto = restar("neto", "Beneficio neto", ebt, impuesto);

  return { ingresos: tIngresos, porTipo, variables: tVariables, porVariable, margenBruto, fijos: tFijos, porFijo, personal, director, bonus, ebitda, amortizacion, ebit, intereses, ebt, impuesto, neto, tipoImpuesto: tipo };
}
