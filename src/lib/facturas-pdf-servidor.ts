import "server-only";

// Convierte una factura a PDF con la plantilla (hoja "Emitir"): se rellena el Excel,
// se sube un momento a 00. CRM/TEMPORAL, Microsoft lo convierte y se borra.

import { randomUUID } from "node:crypto";
import {
  TIPO_XLSX, asegurarCarpeta, descargar, descargarComoPdf, eliminarElemento, elementoPorRuta, rutaReal, subir,
} from "@/lib/graph/sharepoint";
import { rellenarFactura, type DatosFacturaExcel } from "@/lib/excel/factura";
import type { DatosFacturacion } from "@/lib/datos/tipos";

const RUTA_PLANTILLA_FACTURA = "CARPA DIEM/02. PLANTILLAS/03. FACTURAS/PLANTILLA FACTURA CRM _ CARPADIEM.xlsx";
const CARPETA_TEMPORAL = "CARPA DIEM/00. CRM/TEMPORAL";
export const CARPETA_EMITIDAS = "CARPA DIEM/03. FINANCIERO/01. FACTURAS/01. PENDIENTE SARA/01. EMITIDAS";

export async function pdfFactura(datos: DatosFacturaExcel): Promise<Uint8Array> {
  const plantilla = await elementoPorRuta(rutaReal(RUTA_PLANTILLA_FACTURA));
  if (!plantilla) throw new Error(`No encuentro la plantilla de factura (${rutaReal(RUTA_PLANTILLA_FACTURA)})`);
  const xlsx = await rellenarFactura(await descargar(plantilla.id), datos);
  const temporal = rutaReal(CARPETA_TEMPORAL);
  await asegurarCarpeta(temporal);
  const borrador = await subir(`${temporal}/${randomUUID()}.xlsx`, xlsx, TIPO_XLSX);
  try {
    return await descargarComoPdf(borrador.id);
  } finally {
    await eliminarElemento(borrador.id).catch(() => undefined);
  }
}

// Datos de facturación que tendrá la factura al emitirla: los suyos; si no, los del evento; si no, los del cliente
export function datosAlEmitir(f: DatosFacturacion, evento: DatosFacturacion | null, cliente: DatosFacturacion | null): DatosFacturacion {
  if (f.fact_nombre) return f;
  if (evento?.fact_nombre) return evento;
  return cliente ?? f;
}
