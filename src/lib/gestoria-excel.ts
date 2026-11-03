// Excel del trimestre para la gestoría: libro de facturas emitidas y de facturas recibidas,
// con sus totales. Fechas e importes como en el Excel contable.

import ExcelJS from "exceljs";

export type FilaEmitida = { codigo: string; fecha: string; nombre: string; nif: string | null; concepto: string | null; base: number; ivaPct: number; iva: number; suplidos: number; total: number; estado: string };
export type FilaRecibida = { fecha: string; numero: string | null; proveedor: string; nif: string | null; concepto: string | null; base: number; ivaPct: number; iva: number; irpfPct: number; irpf: number; total: number; estado: string };

const ROJO = "FFD63B35";

function fecha(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function hoja(libro: ExcelJS.Workbook, nombre: string, columnas: { titulo: string; clave: string; ancho: number; euros?: boolean; fecha?: boolean }[], filas: Record<string, unknown>[], totales: string[]) {
  const ws = libro.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columnas.map((c) => ({ header: c.titulo, key: c.clave, width: c.ancho }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROJO } };
  for (const f of filas) ws.addRow(Object.fromEntries(columnas.map((c) => [c.clave, c.fecha ? fecha(String(f[c.clave])) : f[c.clave] ?? null])));
  if (filas.length) {
    const total = ws.addRow(Object.fromEntries([[columnas[0].clave, "TOTAL"], ...totales.map((k) => [k, filas.reduce((s, f) => s + Number(f[k] ?? 0), 0)])]));
    total.font = { bold: true };
  }
  columnas.forEach((c, i) => {
    if (c.euros) ws.getColumn(i + 1).numFmt = '#,##0.00 "€"';
    if (c.fecha) ws.getColumn(i + 1).numFmt = "dd/mm/yyyy";
  });
  return ws;
}

export async function excelTrimestre(anio: number, trimestre: number, emitidas: FilaEmitida[], recibidas: FilaRecibida[]): Promise<Uint8Array> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Carpa Diem CRM";
  hoja(libro, "Emitidas", [
    { titulo: "Nº Factura", clave: "codigo", ancho: 13 },
    { titulo: "Fecha", clave: "fecha", ancho: 12, fecha: true },
    { titulo: "Cliente", clave: "nombre", ancho: 32 },
    { titulo: "NIF", clave: "nif", ancho: 13 },
    { titulo: "Concepto", clave: "concepto", ancho: 44 },
    { titulo: "Base", clave: "base", ancho: 12, euros: true },
    { titulo: "IVA %", clave: "ivaPct", ancho: 7 },
    { titulo: "IVA", clave: "iva", ancho: 11, euros: true },
    { titulo: "Suplidos", clave: "suplidos", ancho: 11, euros: true },
    { titulo: "Total", clave: "total", ancho: 12, euros: true },
    { titulo: "Estado", clave: "estado", ancho: 10 },
  ], emitidas, ["base", "iva", "suplidos", "total"]);
  hoja(libro, "Recibidas", [
    { titulo: "Fecha", clave: "fecha", ancho: 12, fecha: true },
    { titulo: "Nº Factura", clave: "numero", ancho: 14 },
    { titulo: "Proveedor", clave: "proveedor", ancho: 30 },
    { titulo: "NIF", clave: "nif", ancho: 13 },
    { titulo: "Concepto", clave: "concepto", ancho: 32 },
    { titulo: "Base", clave: "base", ancho: 12, euros: true },
    { titulo: "IVA %", clave: "ivaPct", ancho: 7 },
    { titulo: "IVA", clave: "iva", ancho: 11, euros: true },
    { titulo: "IRPF %", clave: "irpfPct", ancho: 7 },
    { titulo: "IRPF", clave: "irpf", ancho: 11, euros: true },
    { titulo: "Total", clave: "total", ancho: 12, euros: true },
    { titulo: "Estado", clave: "estado", ancho: 10 },
  ], recibidas, ["base", "iva", "irpf", "total"]);
  libro.title = `Facturas Carpa Diem ${anio} ${trimestre}T`;
  return new Uint8Array(await libro.xlsx.writeBuffer());
}

export const nombreExcelTrimestre = (anio: number, t: number) => `RESUMEN FACTURAS CARPA DIEM ${anio} ${t}T.xlsx`;
export const carpetaTrimestre = (anio: number, t: number) => `CARPA DIEM/03. FINANCIERO/01. FACTURAS/${anio}/${t} TRIMESTRE`;
export const CARPETA_PENDIENTE_SARA = "CARPA DIEM/03. FINANCIERO/01. FACTURAS/01. PENDIENTE SARA";
