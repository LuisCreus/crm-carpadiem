// Copia de seguridad del CRM en Excel: una foto para consultar, no para editar.
// Hojas: Presupuestos, Eventos, Leads, Cobros y Material.

import ExcelJS from "exceljs";

export type Fila = Record<string, unknown>;
export type DatosCopia = {
  presupuestos: Fila[];
  eventos: Fila[];
  leads: Fila[];
  cobros: Fila[];
  material: Fila[];
};

type Columna = { titulo: string; clave: string; ancho?: number; tipo?: "fecha" | "fechaHora" | "euros" | "numero" };

const HOJAS: { nombre: string; clave: keyof DatosCopia; columnas: Columna[] }[] = [
  {
    nombre: "Presupuestos", clave: "presupuestos", columnas: [
      { titulo: "Nº", clave: "codigo", ancho: 9 },
      { titulo: "Año", clave: "anio", ancho: 7, tipo: "numero" },
      { titulo: "Cliente", clave: "cliente", ancho: 32 },
      { titulo: "Estado", clave: "estado", ancho: 15 },
      { titulo: "Tipo de evento", clave: "tipo_evento", ancho: 16 },
      { titulo: "Fecha evento", clave: "fecha_evento", ancho: 13, tipo: "fecha" },
      { titulo: "Precisión fecha", clave: "fecha_precision", ancho: 12 },
      { titulo: "Fecha fin", clave: "fecha_fin", ancho: 12, tipo: "fecha" },
      { titulo: "Ubicación", clave: "ubicacion", ancho: 28 },
      { titulo: "Provincia", clave: "provincia", ancho: 14 },
      { titulo: "Material", clave: "material", ancho: 40 },
      { titulo: "Importe (sin IVA)", clave: "importe", ancho: 14, tipo: "euros" },
      { titulo: "% reserva", clave: "reserva_pct", ancho: 10, tipo: "numero" },
      { titulo: "Comercial", clave: "comercial", ancho: 12 },
      { titulo: "Intermediario", clave: "intermediario", ancho: 22 },
      { titulo: "Enviado", clave: "enviado_at", ancho: 16, tipo: "fechaHora" },
      { titulo: "Carpeta SharePoint", clave: "sp_carpeta_url", ancho: 30 },
      { titulo: "Creado", clave: "created_at", ancho: 16, tipo: "fechaHora" },
    ],
  },
  {
    nombre: "Eventos", clave: "eventos", columnas: [
      { titulo: "Presupuesto", clave: "codigo", ancho: 11 },
      { titulo: "Cliente", clave: "cliente", ancho: 32 },
      { titulo: "Estado", clave: "estado", ancho: 14 },
      { titulo: "Modalidad", clave: "modalidad", ancho: 12 },
      { titulo: "Inicio", clave: "fecha_inicio", ancho: 12, tipo: "fecha" },
      { titulo: "Fin", clave: "fecha_fin", ancho: 12, tipo: "fecha" },
      { titulo: "Ubicación", clave: "ubicacion", ancho: 28 },
      { titulo: "Provincia", clave: "provincia", ancho: 14 },
      { titulo: "Material", clave: "material", ancho: 40 },
      { titulo: "Importe", clave: "importe", ancho: 13, tipo: "euros" },
      { titulo: "Cobrado", clave: "cobrado", ancho: 13, tipo: "euros" },
      { titulo: "Retenido", clave: "importe_retenido", ancho: 12, tipo: "euros" },
      { titulo: "Montaje", clave: "montaje_inicio", ancho: 16, tipo: "fechaHora" },
      { titulo: "Desmontaje", clave: "desmontaje_inicio", ancho: 16, tipo: "fechaHora" },
      { titulo: "Larga duración", clave: "es_larga_duracion", ancho: 10 },
      { titulo: "Comentarios", clave: "comentarios", ancho: 40 },
    ],
  },
  {
    nombre: "Leads", clave: "leads", columnas: [
      { titulo: "Cliente", clave: "cliente_nombre", ancho: 28 },
      { titulo: "Estado", clave: "estado", ancho: 18 },
      { titulo: "Comercial", clave: "comercial", ancho: 12 },
      { titulo: "Primer contacto", clave: "fecha_primer_contacto", ancho: 13, tipo: "fecha" },
      { titulo: "Contacto", clave: "contacto_nombre", ancho: 20 },
      { titulo: "Teléfono", clave: "telefono", ancho: 14 },
      { titulo: "Email", clave: "email", ancho: 26 },
      { titulo: "Canal", clave: "canal", ancho: 11 },
      { titulo: "Fecha aprox.", clave: "fecha_evento_aprox", ancho: 14 },
      { titulo: "Lugar aprox.", clave: "lugar_aprox", ancho: 18 },
      { titulo: "Qué pide", clave: "que_pide", ancho: 32 },
      { titulo: "Próxima acción", clave: "proxima_accion_fecha", ancho: 13, tipo: "fecha" },
      { titulo: "Acción", clave: "proxima_accion_texto", ancho: 26 },
      { titulo: "Comentarios", clave: "comentarios", ancho: 32 },
    ],
  },
  {
    nombre: "Cobros", clave: "cobros", columnas: [
      { titulo: "Presupuesto", clave: "codigo", ancho: 11 },
      { titulo: "Cliente", clave: "cliente", ancho: 32 },
      { titulo: "Fecha", clave: "fecha", ancho: 12, tipo: "fecha" },
      { titulo: "Importe", clave: "importe", ancho: 13, tipo: "euros" },
      { titulo: "Concepto", clave: "concepto", ancho: 11 },
      { titulo: "Notas", clave: "notas", ancho: 32 },
    ],
  },
  {
    nombre: "Material", clave: "material", columnas: [
      { titulo: "Evento", clave: "cliente", ancho: 30 },
      { titulo: "Material", clave: "material", ancho: 30 },
      { titulo: "Sale / entra", clave: "sentido", ancho: 11 },
      { titulo: "Cantidad", clave: "cantidad", ancho: 10, tipo: "numero" },
      { titulo: "Fecha", clave: "fecha", ancho: 12, tipo: "fecha" },
      { titulo: "Notas", clave: "notas", ancho: 32 },
    ],
  },
];

// "2027-05-08" → fecha de Excel; los timestamps, en hora de Madrid
function valor(v: unknown, tipo?: Columna["tipo"]): ExcelJS.CellValue {
  if (v === null || v === undefined || v === "") return null;
  if (tipo === "fecha" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [a, m, d] = v.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(a, m - 1, d));
  }
  if (tipo === "fechaHora" && typeof v === "string") {
    const madrid = new Date(new Date(v).toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
    return new Date(Date.UTC(madrid.getFullYear(), madrid.getMonth(), madrid.getDate(), madrid.getHours(), madrid.getMinutes()));
  }
  if ((tipo === "euros" || tipo === "numero") && v !== null) return Number(v);
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return String(v);
}

export async function generarExcelCopia(datos: DatosCopia, fecha: Date): Promise<Uint8Array> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Carpa Diem CRM";
  libro.created = fecha;
  for (const hoja of HOJAS) {
    const ws = libro.addWorksheet(hoja.nombre, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = hoja.columnas.map((c) => ({ header: c.titulo, key: c.clave, width: c.ancho ?? 14 }));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD63B35" } };
    for (const fila of datos[hoja.clave]) {
      ws.addRow(Object.fromEntries(hoja.columnas.map((c) => [c.clave, valor(fila[c.clave], c.tipo)])));
    }
    hoja.columnas.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.tipo === "fecha") col.numFmt = "dd/mm/yyyy";
      if (c.tipo === "fechaHora") col.numFmt = "dd/mm/yyyy hh:mm";
      if (c.tipo === "euros") col.numFmt = '#,##0.00 "€"';
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columnas.length } };
  }
  // Es una foto: se protege contra cambios accidentales (sin contraseña)
  for (const ws of libro.worksheets) await ws.protect("", { selectLockedCells: true, selectUnlockedCells: true, autoFilter: true, sort: true });
  return new Uint8Array(await libro.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------
// Nombres y conservación (últimas 12 semanas)
// ---------------------------------------------------------------------

export function fechaMadrid(fecha: Date): string {
  return fecha.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
}

export function nombreCopia(fecha: Date): string {
  return `CRM CARPA DIEM ${fechaMadrid(fecha)}.xlsx`;
}

// De los archivos de la carpeta, los que sobran: copias del CRM más allá de las N más recientes
export function copiasQueSobran(nombres: string[], conservar = 12): string[] {
  const copias = nombres.filter((n) => /^CRM CARPA DIEM \d{4}-\d{2}-\d{2}\.xlsx$/.test(n)).sort().reverse();
  return copias.slice(conservar);
}
