import "server-only";

// P&L en Excel con el mismo formato que la hoja "P&L" del Excel contable
// (Cuentas_y_facturas_Carpadiem_Ibérica_SL): para dársela a un asesor. Lleva fórmulas en los
// totales para que se pueda analizar, y hojas con el detalle de facturas, gastos y equipos.

import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uno } from "@/lib/datos/tipos";
import { totalFactura } from "@/lib/facturacion";
import { leerTodo } from "@/lib/supabase/leer-todo";
import { calcularPyg, cuotaActivo, type Activo, type Fila, type Manual, type Pyg } from "@/lib/pyg";

type Datos = {
  pyg: Pyg;
  emitidas: { codigo: string; fecha: string; cliente: string; evento: string; tipo: string; base: number; iva: number; total: number; estado: string }[];
  recibidas: { fecha: string; proveedor: string; numero: string; categoria: string; tipo: string; evento: string; base: number; ivaPct: number; total: number; estado: string }[];
  activos: (Activo & { notas: string | null })[];
};

const todas = (q: () => any) => leerTodo((d, h) => q().range(d, h)) as Promise<any[]>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function datosPyg(sb: SupabaseClient, anio: number): Promise<Datos> {
  const [ev, fa, ga, cg, te, ac, pm] = await Promise.all([
    todas(() => sb.from("eventos").select("id, estado, fecha_precision, fecha_inicio, fecha_fin, importe, importe_retenido, es_larga_duracion, tipo_evento, cliente:clientes(nombre)").is("deleted_at", null).order("id")),
    todas(() => sb.from("facturas").select("id, evento_id, importe, iva_pct, suplidos, estado, fecha_emision, codigo, tipo, fact_nombre").is("deleted_at", null).order("id")),
    todas(() => sb.from("facturas_recibidas").select("id, evento_id, base, iva_pct, total, fecha, categoria, numero, estado, proveedor:proveedores(nombre)").is("deleted_at", null).order("id")),
    sb.from("categorias_gasto").select("codigo, nombre, tipo"),
    sb.from("tipos_evento").select("codigo, nombre"),
    sb.from("activos").select("id, nombre, coste, vida_anios, fecha_compra, cuota_manual, notas").order("fecha_compra"),
    sb.from("pyg_manual").select("mes, concepto, importe"),
  ]);
  for (const r of [cg, te, ac, pm]) if (r.error) throw new Error(r.error.message);
  const categorias = new Map((cg.data ?? []).map((c) => [c.codigo as string, { nombre: c.nombre as string, tipo: c.tipo as string }]));
  const tipos = new Map((te.data ?? []).map((t) => [t.codigo as string, t.nombre as string]));
  const activos = (ac.data ?? []).map((a) => ({ ...a, coste: Number(a.coste), cuota_manual: a.cuota_manual === null ? null : Number(a.cuota_manual) })) as (Activo & { notas: string | null })[];
  const eventos = ev.map((e) => ({ ...e, cliente: (uno(e.cliente) as { nombre: string } | null)?.nombre ?? "", comision_pct: null,
    importe: e.importe === null ? null : Number(e.importe), importe_retenido: e.importe_retenido === null ? null : Number(e.importe_retenido) }));
  const pyg = calcularPyg(anio, eventos,
    ga.map((g) => ({ evento_id: g.evento_id, base: Number(g.base), fecha: g.fecha, categoria: g.categoria })),
    fa.map((f) => ({ evento_id: f.evento_id, importe: Number(f.importe), estado: f.estado, fecha_emision: f.fecha_emision })),
    activos, (pm.data ?? []).map((m) => ({ ...m, importe: Number(m.importe) })) as Manual[], { tiposEvento: tipos, categorias });

  const nombreEvento = new Map(eventos.map((e) => [e.id as string, e.cliente as string]));
  const delAnio = (f: string | null) => Boolean(f?.startsWith(`${anio}-`));
  return {
    pyg,
    emitidas: fa.filter((f) => f.estado !== "prevista" && delAnio(f.fecha_emision)).sort((a, b) => a.fecha_emision.localeCompare(b.fecha_emision)).map((f) => {
      const t = totalFactura({ importe: Number(f.importe), iva_pct: Number(f.iva_pct), suplidos: Number(f.suplidos) });
      return { codigo: f.codigo, fecha: f.fecha_emision, cliente: f.fact_nombre ?? nombreEvento.get(f.evento_id) ?? "", evento: nombreEvento.get(f.evento_id) ?? "",
        tipo: ({ reserva: "Reserva", resto: "Resto", mensualidad: "Mensualidad" } as Record<string, string>)[f.tipo] ?? "Otra",
        base: t.base, iva: t.iva, total: t.total, estado: f.estado === "pagada" ? "Cobrada" : "Por cobrar" };
    }),
    recibidas: ga.filter((g) => delAnio(g.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((g) => {
      const c = categorias.get(g.categoria ?? "");
      const tipo = g.categoria === "material_carpas" ? "Inversión (CAPEX)" : g.categoria === "director" ? "Personal" : g.evento_id || c?.tipo === "variable" ? "Variable" : "Fijo";
      return { fecha: g.fecha, proveedor: (uno(g.proveedor) as { nombre: string } | null)?.nombre ?? "", numero: g.numero ?? "", categoria: c?.nombre ?? g.categoria ?? "",
        tipo, evento: nombreEvento.get(g.evento_id) ?? "", base: Number(g.base), ivaPct: Number(g.iva_pct), total: Number(g.total), estado: g.estado === "pagada" ? "Pagada" : "Por pagar" };
    }),
    activos,
  };
}

// ---------------------------------------------------------------------
// Estilos de la hoja P&L del Excel contable
// ---------------------------------------------------------------------
const BORDE = { style: "thin" as const, color: { argb: "FFD0D0D0" } };
const BORDES = { left: BORDE, right: BORDE, top: BORDE, bottom: BORDE };
const EUROS = '#,##0" €"';
const EUROS_MES = '#,##0" €";[Red]-#,##0" €";—';
const PCT = "0.0%";
const relleno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
// Color de cabecera y de las filas de detalle de cada bloque
const BLOQUE = {
  ingresos: ["FF2E5595", "FFDCE6F1"], variables: ["FF375623", "FFEBF1DE"], fijos: ["FF595959", "FFF2F2F2"], personal: ["FF7F3F00", "FFFDE9D9"],
} as const;
const COL = (i: number) => String.fromCharCode(68 + i); // D..O
const MESES_COL = Array.from({ length: 12 }, (_, i) => COL(i));

export async function generarExcelPyg(anio: number, d: Datos): Promise<Uint8Array> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Carpa Diem CRM";
  libro.created = new Date();
  // Excel recalcula las fórmulas al abrirlo (porcentajes y totales al día)
  libro.calcProperties.fullCalcOnLoad = true;
  const ws = libro.addWorksheet("P&L", { views: [{ state: "frozen", xSplit: 2, ySplit: 1, showGridLines: false }] });
  ws.columns = [{ width: 1.2 }, { width: 46.6 }, { width: 12 }, ...MESES_COL.map(() => ({ width: 10.6 }))];
  const p = d.pyg;

  // Cabecera: empresa, año y meses
  const cab = ws.getRow(1);
  cab.height = 21.75;
  cab.getCell(2).value = "Carpadiem Ibérica SL  ·  Cuenta de Pérdidas y Ganancias";
  cab.getCell(3).value = anio;
  MESES_COL.forEach((_, i) => { cab.getCell(4 + i).value = new Date(Date.UTC(anio, i, 1)); });
  for (let c = 2; c <= 15; c++) {
    const x = cab.getCell(c);
    x.font = { name: "Calibri", bold: true, size: c === 2 || c === 3 ? 10 : 9, color: { argb: "FFFFFFFF" } };
    x.fill = relleno("FF1F3864");
    x.alignment = { horizontal: c === 2 ? "left" : "center", vertical: "middle" };
    x.border = BORDES;
    if (c === 3) x.numFmt = "0";
    if (c >= 4) x.numFmt = "mmm-yy";
  }
  ws.getRow(2).height = 4;
  let fila = 3;

  // Una fila: valores (con su resultado) o fórmulas por mes, y el total del año
  type Estilo = { tipo: "cabecera" | "detalle" | "resultado" | "pct" | "manual"; fondo: string };
  const pintar = (n: number, nombre: string, e: Estilo) => {
    const r = ws.getRow(n);
    r.height = e.tipo === "cabecera" ? 19.5 : e.tipo === "resultado" ? 18.75 : e.tipo === "pct" ? 12.75 : 15;
    for (let c = 2; c <= 15; c++) {
      const x = r.getCell(c);
      const blanco = e.tipo === "cabecera" || e.tipo === "resultado";
      x.font = {
        name: "Calibri", size: e.tipo === "pct" ? 8 : 9, bold: blanco, italic: e.tipo === "pct",
        color: { argb: blanco ? "FFFFFFFF" : e.tipo === "pct" ? "FF595959" : c >= 4 ? (e.tipo === "manual" ? "FF0070C0" : "FF008000") : "FF000000" },
      };
      x.fill = relleno(e.fondo);
      x.border = BORDES;
      x.alignment = { horizontal: c === 2 ? "left" : e.tipo === "pct" ? "center" : "right", vertical: "middle", indent: c === 2 && !blanco ? 2 : undefined };
      if (c >= 3) x.numFmt = e.tipo === "pct" ? PCT : c === 3 ? EUROS : EUROS_MES;
    }
    r.getCell(2).value = nombre;
  };
  const valores = (n: number, f: Fila) => {
    f.meses.forEach((v, i) => { ws.getCell(`${COL(i)}${n}`).value = Math.round(v * 100) / 100; });
    ws.getCell(`C${n}`).value = { formula: `SUM(D${n}:O${n})`, result: f.total };
  };
  const formula = (n: number, f: Fila, porMes: (col: string) => string) => {
    MESES_COL.forEach((col, i) => { ws.getCell(`${col}${n}`).value = { formula: porMes(col), result: f.meses[i] }; });
    ws.getCell(`C${n}`).value = { formula: `SUM(D${n}:O${n})`, result: f.total };
  };
  const porcentaje = (n: number, nombre: string, sobre: number, de: number) => {
    pintar(n, nombre, { tipo: "pct", fondo: "FFFFFAE6" });
    for (const col of ["C", ...MESES_COL]) ws.getCell(`${col}${n}`).value = { formula: `IFERROR(${col}${sobre}/${col}${de},0)` };
  };

  // Un bloque: cabecera con la suma de su detalle
  const bloque = (total: Fila, detalle: Fila[], colores: readonly [string, string]) => {
    const cabecera = fila++;
    pintar(cabecera, total.nombre.toUpperCase(), { tipo: "cabecera", fondo: colores[0] });
    const desde = fila;
    for (const f of detalle) { pintar(fila, f.nombre, { tipo: "detalle", fondo: colores[1] }); valores(fila, f); fila++; }
    const hasta = fila - 1;
    formula(cabecera, total, (col) => (detalle.length ? `SUM(${col}${desde}:${col}${hasta})` : "0"));
    return cabecera;
  };

  const fIngresos = bloque(p.ingresos, p.porTipo, BLOQUE.ingresos);
  fila++;
  const fVariables = bloque(p.variables, p.porVariable, BLOQUE.variables);
  const fMargen = fila++;
  pintar(fMargen, "MARGEN BRUTO", { tipo: "resultado", fondo: "FF1D4980" });
  formula(fMargen, p.margenBruto, (c) => `${c}${fIngresos}-${c}${fVariables}`);
  porcentaje(fila++, "% margen bruto →", fMargen, fIngresos);
  fila++;
  const fFijos = bloque(p.fijos, p.porFijo, BLOQUE.fijos);
  fila++;
  // Personal: el sueldo del director (facturas de Maketa) y el bonus (a mano)
  const fPersonal = fila++;
  pintar(fPersonal, "COSTES PERSONAL", { tipo: "cabecera", fondo: BLOQUE.personal[0] });
  const fDirector = fila++;
  pintar(fDirector, "Director", { tipo: "detalle", fondo: BLOQUE.personal[1] }); valores(fDirector, p.director);
  const fBonus = fila++;
  pintar(fBonus, "Bonus director", { tipo: "manual", fondo: BLOQUE.personal[1] }); valores(fBonus, p.bonus);
  formula(fPersonal, p.personal, (c) => `SUM(${c}${fDirector}:${c}${fBonus})`);
  fila++;
  const fEbitda = fila++;
  pintar(fEbitda, "EBITDA", { tipo: "resultado", fondo: "FF17375E" });
  formula(fEbitda, p.ebitda, (c) => `${c}${fIngresos}-${c}${fVariables}-${c}${fFijos}-${c}${fPersonal}`);
  porcentaje(fila++, "% EBITDA →", fEbitda, fIngresos);
  const fAmort = fila++;
  pintar(fAmort, "Amortización (equipos)", { tipo: "detalle", fondo: "FFF0F0F0" }); valores(fAmort, p.amortizacion);
  fila++;
  const fEbit = fila++;
  pintar(fEbit, "EBIT", { tipo: "resultado", fondo: "FF0F2C4F" });
  formula(fEbit, p.ebit, (c) => `${c}${fEbitda}-${c}${fAmort}`);
  const fIntereses = fila++;
  pintar(fIntereses, "Intereses préstamo socios", { tipo: "manual", fondo: "FFF0F0F0" }); valores(fIntereses, p.intereses);
  fila++;
  const fEbt = fila++;
  pintar(fEbt, "EBT (Beneficio antes de impuestos)", { tipo: "resultado", fondo: "FF0F2C4F" });
  formula(fEbt, p.ebt, (c) => `${c}${fEbit}-${c}${fIntereses}`);
  // IS en negativo, como en el Excel (Beneficio neto = EBT + IS)
  const fIs = fila++;
  pintar(fIs, `IS  (${Math.round(p.tipoImpuesto * 100)} % sobre el beneficio acumulado del año)`, { tipo: "detalle", fondo: "FFF0F0F0" });
  valores(fIs, { ...p.impuesto, meses: p.impuesto.meses.map((x) => -x), total: -p.impuesto.total });
  fila++;
  const fNeto = fila++;
  pintar(fNeto, "BENEFICIO NETO", { tipo: "resultado", fondo: "FF1F3864" });
  ws.getRow(fNeto).height = 21;
  formula(fNeto, p.neto, (c) => `${c}${fEbt}+${c}${fIs}`);
  porcentaje(fila++, "% margen neto →", fNeto, fIngresos);
  fila++;
  const nota = ws.getCell(`B${fila}`);
  nota.value = "Criterio: cada factura en el mes de su fecha (ingresos al emitirse, gastos en el mes de su factura). Sin IVA. "
    + "Verde: calculado por el CRM · Azul: introducido a mano. Generado el " + new Date().toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" }) + ".";
  nota.font = { name: "Calibri", italic: true, size: 8, color: { argb: "FF595959" } };
  ws.mergeCells(`B${fila}:O${fila}`);

  // ---- Detalle para analizar
  const tabla = (nombre: string, columnas: { titulo: string; ancho: number; fmt?: string }[], filas: (string | number | Date | null)[][]) => {
    const h = libro.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
    h.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho }));
    const t = h.getRow(1);
    t.font = { name: "Calibri", bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    t.fill = relleno("FF1F3864");
    t.height = 18;
    for (const f of filas) h.addRow(f).font = { name: "Calibri", size: 9 };
    h.addRow(["Total"]).font = { name: "Calibri", bold: true, size: 9 };
    columnas.forEach((c, i) => { if (c.fmt) h.getColumn(i + 1).numFmt = c.fmt; });
    h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
    return h;
  };
  const DEC = '#,##0.00" €";[Red]-#,##0.00" €";—';
  const fecha = (s: string) => { const [a, m, dd] = s.split("-").map(Number); return new Date(Date.UTC(a, m - 1, dd)); };
  tabla(`Ingresos ${anio}`, [
    { titulo: "Nº factura", ancho: 13 }, { titulo: "Fecha", ancho: 11, fmt: "dd/mm/yyyy" }, { titulo: "Cliente", ancho: 32 }, { titulo: "Evento", ancho: 28 },
    { titulo: "Tipo", ancho: 12 }, { titulo: "Base", ancho: 12, fmt: DEC }, { titulo: "IVA", ancho: 11, fmt: DEC }, { titulo: "Total", ancho: 12, fmt: DEC }, { titulo: "Estado", ancho: 11 },
  ], d.emitidas.map((f) => [f.codigo, fecha(f.fecha), f.cliente, f.evento, f.tipo, f.base, f.iva, f.total, f.estado]));
  tabla(`Gastos ${anio}`, [
    { titulo: "Fecha", ancho: 11, fmt: "dd/mm/yyyy" }, { titulo: "Proveedor", ancho: 28 }, { titulo: "Nº factura", ancho: 14 }, { titulo: "Categoría", ancho: 26 },
    { titulo: "Tipo", ancho: 16 }, { titulo: "Evento", ancho: 26 }, { titulo: "Base", ancho: 12, fmt: DEC }, { titulo: "IVA %", ancho: 7 }, { titulo: "Total", ancho: 12, fmt: DEC }, { titulo: "Estado", ancho: 10 },
  ], d.recibidas.map((g) => [fecha(g.fecha), g.proveedor, g.numero, g.categoria, g.tipo, g.evento, g.base, g.ivaPct, g.total, g.estado]));
  tabla("Equipos (CAPEX)", [
    { titulo: "Equipo", ancho: 42 }, { titulo: "Coste", ancho: 12, fmt: DEC }, { titulo: "Vida (años)", ancho: 10 }, { titulo: "Compra", ancho: 11, fmt: "dd/mm/yyyy" },
    { titulo: "Cuota mensual", ancho: 13, fmt: DEC }, { titulo: `Amortización ${anio}`, ancho: 15, fmt: DEC }, { titulo: "Factura o notas", ancho: 34 },
  ], d.activos.map((a) => [a.nombre, a.coste, a.vida_anios, fecha(a.fecha_compra), a.cuota_manual ?? Math.round(a.coste / a.vida_anios / 12 * 100) / 100,
    Math.round(Array.from({ length: 12 }, (_, i) => cuotaActivo(a, `${anio}-${String(i + 1).padStart(2, "0")}`)).reduce((s, x) => s + x, 0) * 100) / 100, a.notas]));
  // Totales de las columnas en euros
  for (const h of libro.worksheets.slice(1)) {
    const ultima = h.rowCount;
    const tot = h.getRow(ultima);
    h.columns.forEach((c, i) => {
      if (c.numFmt === DEC) {
        const letra = String.fromCharCode(65 + i);
        tot.getCell(i + 1).value = { formula: `SUM(${letra}2:${letra}${ultima - 1})` };
        tot.getCell(i + 1).numFmt = DEC;
      }
    });
  }
  return new Uint8Array(await libro.xlsx.writeBuffer());
}
