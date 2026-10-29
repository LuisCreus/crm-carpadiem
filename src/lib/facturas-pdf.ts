"use server";

// PDF de las facturas: se rellena la plantilla (hoja "Emitir" del Excel contable),
// Microsoft la convierte a PDF y se guarda en 01. PENDIENTE SARA/01. EMITIDAS.

import { randomUUID } from "node:crypto";
import { obtenerUsuario } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  ErrorSharePoint, TIPO_PDF, TIPO_XLSX, asegurarCarpeta, descargar, descargarComoPdf, eliminarElemento,
  elementoPorId, elementoPorRuta, reemplazarContenido, rutaReal, sharepointConfigurado, subir,
} from "@/lib/graph/sharepoint";
import { rellenarFactura } from "@/lib/excel/factura";
import { nombreArchivoFactura } from "@/lib/facturacion";

const RUTA_PLANTILLA_FACTURA = "CARPA DIEM/02. PLANTILLAS/03. FACTURAS/PLANTILLA FACTURA CRM _ CARPADIEM.xlsx";
const CARPETA_EMITIDAS = "CARPA DIEM/03. FINANCIERO/01. FACTURAS/01. PENDIENTE SARA/01. EMITIDAS";
const CARPETA_TEMPORAL = "CARPA DIEM/00. CRM/TEMPORAL";

type Resultado = { ok: true; nombre: string; webUrl: string } | { ok: false; error: string };

export async function generarPdfFactura(facturaId: string): Promise<Resultado> {
  try {
    await obtenerUsuario();
    if (!sharepointConfigurado()) throw new ErrorSharePoint("SharePoint todavía no está configurado en el CRM.");
    const sb = await crearClienteServidor();
    const { data: f, error } = await sb.from("facturas")
      .select("id, numero, codigo, estado, fecha_emision, concepto, tipo, importe, iva_pct, suplidos, fact_nombre, fact_nif, fact_domicilio, fact_cp_ciudad, pdf_item_id")
      .eq("id", facturaId).single();
    if (error || !f) throw new Error("Factura no encontrada");
    if (f.estado === "prevista" || !f.codigo || !f.numero || !f.fecha_emision) throw new Error("Primero hay que emitir la factura");
    if (!f.fact_nombre) throw new Error("La factura no tiene datos de facturación");

    const plantilla = await elementoPorRuta(rutaReal(RUTA_PLANTILLA_FACTURA));
    if (!plantilla) throw new Error(`No encuentro la plantilla de factura (${rutaReal(RUTA_PLANTILLA_FACTURA)})`);
    const xlsx = await rellenarFactura(await descargar(plantilla.id), {
      codigo: f.codigo,
      fecha: f.fecha_emision,
      nombre: f.fact_nombre,
      domicilio: f.fact_domicilio,
      cpCiudad: f.fact_cp_ciudad,
      nif: f.fact_nif,
      concepto: f.concepto ?? "Honorarios correspondientes a servicio de CARPAS",
      importe: Number(f.importe),
      ivaPct: Number(f.iva_pct),
      suplidos: Number(f.suplidos),
    });

    // Microsoft convierte a PDF un archivo de SharePoint: se sube un momento y se borra
    const temporal = rutaReal(CARPETA_TEMPORAL);
    await asegurarCarpeta(temporal);
    const borrador = await subir(`${temporal}/${randomUUID()}.xlsx`, xlsx, TIPO_XLSX);
    let pdf: Uint8Array;
    try {
      pdf = await descargarComoPdf(borrador.id);
    } finally {
      await eliminarElemento(borrador.id).catch(() => undefined);
    }

    // Si ya tenía PDF (aunque Sara lo haya movido de carpeta), se sustituye; si no, va a PENDIENTE SARA
    const existente = f.pdf_item_id ? await elementoPorId(f.pdf_item_id) : null;
    // Como las de PENDIENTE SARA: con el nombre de a quién se factura
    const nombre = existente?.name ?? nombreArchivoFactura(f.numero, f.fact_nombre);
    let item;
    if (existente) item = await reemplazarContenido(existente.id, pdf, TIPO_PDF);
    else {
      const carpeta = rutaReal(CARPETA_EMITIDAS);
      await asegurarCarpeta(carpeta);
      if (await elementoPorRuta(`${carpeta}/${nombre}`)) {
        throw new Error(`Ya existe "${nombre}" en la carpeta. No lo sustituyo: revisa la carpeta.`);
      }
      item = await subir(`${carpeta}/${nombre}`, pdf, TIPO_PDF);
    }
    const r = await sb.from("facturas").update({ pdf_item_id: item.id, pdf_url: item.webUrl, pdf_nombre: nombre }).eq("id", facturaId);
    if (r.error) throw new Error(r.error.message);
    return { ok: true, nombre, webUrl: item.webUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido" };
  }
}
