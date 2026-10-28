"use server";

// Acciones de documentos del presupuesto (se ejecutan en el servidor).
// SharePoint se usa como la aplicación del CRM; la base de datos, como el
// usuario que pulsa el botón (así el historial dice quién lo hizo).

import { obtenerUsuario } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  ErrorSharePoint, TIPO_DOCX, TIPO_PDF, asegurarCarpeta, descargar, descargarComoPdf, elementoPorId,
  elementoPorRuta, moverRenombrar, rutaPlantilla, rutaReal, sharepointConfigurado, subir, urlDirecta,
} from "@/lib/graph/sharepoint";
import { leerImporte, rellenarControles } from "@/lib/word/controles";
import { cargarDatosHoja, generarPdfHoja, nombreArchivoHoja } from "@/lib/hoja-montaje";
import { codigoPresupuesto } from "@/lib/formato";
import { nombreArchivoPresupuesto, rutaCarpetaCliente, textoFechaEvento, type PrecisionFecha } from "@/lib/negocio";

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

type PresupuestoDoc = {
  id: string;
  numero: number;
  plantilla: "carpadiem" | "neutra";
  fecha_precision: PrecisionFecha;
  fecha_evento: string | null;
  fecha_fin: string | null;
  ubicacion: string | null;
  provincia: string | null;
  reserva_pct: number | null;
  sp_carpeta_id: string | null;
  sp_carpeta_ruta: string | null;
  oportunidad_id: string | null;
  cliente: { nombre: string } | { nombre: string }[] | null;
};

const nombreCliente = (p: PresupuestoDoc) => (Array.isArray(p.cliente) ? p.cliente[0]?.nombre : p.cliente?.nombre) ?? "";

async function contexto(presupuestoId: string) {
  await obtenerUsuario();
  if (!sharepointConfigurado()) throw new ErrorSharePoint("SharePoint todavía no está configurado en el CRM.");
  const sb = await crearClienteServidor();
  const { data, error } = await sb
    .from("presupuestos")
    .select("id, numero, plantilla, fecha_precision, fecha_evento, fecha_fin, ubicacion, provincia, reserva_pct, sp_carpeta_id, sp_carpeta_ruta, oportunidad_id, cliente:clientes(nombre)")
    .eq("id", presupuestoId)
    .single();
  if (error || !data) throw new Error("Presupuesto no encontrado");
  return { sb, p: data as PresupuestoDoc };
}

function valoresControles(p: PresupuestoDoc) {
  const valores: Record<string, string> = {
    cliente: nombreCliente(p),
    fecha: textoFechaEvento(p.fecha_precision, p.fecha_evento, p.fecha_fin),
    ubicacion: [p.ubicacion, p.provincia].filter(Boolean).join(", "),
    numero: codigoPresupuesto(p.numero),
  };
  if (p.reserva_pct !== null) valores.reserva = String(Number(p.reserva_pct)).replace(".", ",");
  return valores;
}

async function capturar<T>(fn: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await fn();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido" };
  }
}

// Carpeta del cliente: la crea si no existe y la guarda en el presupuesto
async function asegurarCarpetaPresupuesto(sb: Awaited<ReturnType<typeof crearClienteServidor>>, p: PresupuestoDoc) {
  if (p.sp_carpeta_id) {
    const existente = await elementoPorId(p.sp_carpeta_id);
    if (existente) return { carpeta: existente, ruta: p.sp_carpeta_ruta ?? rutaReal(rutaCarpetaCliente(p.fecha_precision, p.fecha_evento, nombreCliente(p))) };
  }
  // Si otra opción de la misma oportunidad ya tiene carpeta, se usa la misma
  if (p.oportunidad_id) {
    const { data: otra } = await sb.from("presupuestos").select("sp_carpeta_id, sp_carpeta_ruta")
      .eq("oportunidad_id", p.oportunidad_id).not("sp_carpeta_id", "is", null).limit(1).maybeSingle();
    if (otra?.sp_carpeta_id) {
      const existente = await elementoPorId(otra.sp_carpeta_id);
      if (existente) {
        await sb.from("presupuestos").update({ sp_carpeta_id: existente.id, sp_carpeta_url: existente.webUrl, sp_carpeta_ruta: otra.sp_carpeta_ruta }).eq("id", p.id);
        return { carpeta: existente, ruta: otra.sp_carpeta_ruta as string };
      }
    }
  }
  const ruta = rutaReal(rutaCarpetaCliente(p.fecha_precision, p.fecha_evento, nombreCliente(p)));
  const carpeta = await asegurarCarpeta(ruta);
  await sb.from("presupuestos").update({ sp_carpeta_id: carpeta.id, sp_carpeta_url: carpeta.webUrl, sp_carpeta_ruta: ruta }).eq("id", p.id);
  return { carpeta, ruta };
}

async function subirWord(sb: Awaited<ReturnType<typeof crearClienteServidor>>, p: PresupuestoDoc, ruta: string, version: number, docx: Uint8Array) {
  const nombre = nombreArchivoPresupuesto(p.numero, nombreCliente(p), version, "docx");
  const rutaArchivo = `${ruta}/${nombre}`;
  if (await elementoPorRuta(rutaArchivo)) {
    throw new Error(`Ya existe "${nombre}" en la carpeta. No lo sustituyo para no perder cambios.`);
  }
  const item = await subir(rutaArchivo, docx, TIPO_DOCX);
  const { error } = await sb.from("presupuesto_versiones")
    .update({ docx_item_id: item.id, docx_url: item.webUrl, docx_ruta: rutaArchivo, nombre_archivo: nombre })
    .eq("presupuesto_id", p.id).eq("version", version);
  if (error) throw new Error(error.message);
  return { nombre, webUrl: item.webUrl, escritorio: `ms-word:ofe|u|${await urlDirecta(rutaArchivo)}` };
}

// "Crear Word": carpeta + .docx desde la plantilla (o desde otro presupuesto al duplicar)
export async function crearDocumento(presupuestoId: string, origenId?: string): Promise<Resultado<{ webUrl: string; escritorio: string; nombre: string }>> {
  return capturar(async () => {
    const { sb, p } = await contexto(presupuestoId);
    const { data: version } = await sb.from("presupuesto_versiones").select("version, docx_item_id")
      .eq("presupuesto_id", p.id).order("version", { ascending: false }).limit(1).single();
    if (!version) throw new Error("El presupuesto no tiene versiones");
    if (version.docx_item_id) throw new Error("Este presupuesto ya tiene su Word");

    let base: Uint8Array;
    if (origenId) {
      const { data: v } = await sb.from("presupuesto_versiones").select("docx_item_id")
        .eq("presupuesto_id", origenId).not("docx_item_id", "is", null).order("version", { ascending: false }).limit(1).maybeSingle();
      if (!v?.docx_item_id) throw new Error("El presupuesto original no tiene Word en SharePoint");
      base = await descargar(v.docx_item_id);
    } else {
      const plantilla = await elementoPorRuta(rutaPlantilla(p.plantilla));
      if (!plantilla) throw new Error(`No encuentro la plantilla del CRM (${rutaPlantilla(p.plantilla)})`);
      base = await descargar(plantilla.id);
    }

    const { docx } = await rellenarControles(base, valoresControles(p));
    const { ruta } = await asegurarCarpetaPresupuesto(sb, p);
    return { ok: true, ...(await subirWord(sb, p, ruta, version.version, docx)) };
  });
}

// "Crear V02": copia el último Word como versión nueva
export async function crearVersionDocumento(presupuestoId: string): Promise<Resultado<{ version: number; webUrl: string; escritorio: string }>> {
  return capturar(async () => {
    const { sb, p } = await contexto(presupuestoId);
    const { data: ultima } = await sb.from("presupuesto_versiones").select("version, docx_item_id")
      .eq("presupuesto_id", p.id).not("docx_item_id", "is", null).order("version", { ascending: false }).limit(1).maybeSingle();
    if (!ultima?.docx_item_id) throw new Error("Primero hay que crear el Word");
    const base = await descargar(ultima.docx_item_id);
    const { data: nueva, error } = await sb.rpc("nueva_version", { p_id: p.id });
    if (error) throw new Error(error.message);
    const { ruta } = await asegurarCarpetaPresupuesto(sb, p);
    const subido = await subirWord(sb, p, ruta, nueva as number, base);
    return { ok: true, version: nueva as number, webUrl: subido.webUrl, escritorio: subido.escritorio };
  });
}

// "Generar PDF": convierte el último Word guardado y lee el importe
export async function generarPdf(presupuestoId: string, forzar = false): Promise<Resultado<{ esperar?: boolean; total: number | null; reservaPct: number | null; version: number }>> {
  return capturar<{ esperar?: boolean; total: number | null; reservaPct: number | null; version: number }>(async () => {
    const { sb, p } = await contexto(presupuestoId);
    const { data: v } = await sb.from("presupuesto_versiones").select("version, docx_item_id, docx_ruta")
      .eq("presupuesto_id", p.id).not("docx_item_id", "is", null).order("version", { ascending: false }).limit(1).maybeSingle();
    if (!v?.docx_item_id) throw new Error("Primero hay que crear el Word");

    const item = await elementoPorId(v.docx_item_id);
    if (!item) throw new Error("El Word ya no está en SharePoint (¿lo han movido o borrado?)");
    const segundos = (Date.now() - new Date(item.lastModifiedDateTime).getTime()) / 1000;
    if (!forzar && segundos < 20) return { ok: true, esperar: true, total: null, reservaPct: null, version: v.version };

    const [pdf, docx] = await Promise.all([descargarComoPdf(item.id), descargar(item.id)]);
    const rutaPdf = (v.docx_ruta as string | null)?.replace(/\.docx$/i, ".pdf")
      ?? `${rutaReal(rutaCarpetaCliente(p.fecha_precision, p.fecha_evento, nombreCliente(p)))}/${nombreArchivoPresupuesto(p.numero, nombreCliente(p), v.version, "pdf")}`;
    const subido = await subir(rutaPdf, pdf, TIPO_PDF);
    const { total, reservaPct } = await leerImporte(docx);
    const { error } = await sb.from("presupuesto_versiones")
      .update({ pdf_item_id: subido.id, pdf_url: subido.webUrl, pdf_generado_at: new Date().toISOString() })
      .eq("presupuesto_id", p.id).eq("version", v.version);
    if (error) throw new Error(error.message);
    return { ok: true, total, reservaPct, version: v.version };
  });
}

// Carpeta con nombre distinto al que le toca (cambió la fecha o el cliente)
export async function moverCarpeta(presupuestoId: string): Promise<Resultado<{ ruta: string }>> {
  return capturar(async () => {
    const { sb, p } = await contexto(presupuestoId);
    if (!p.sp_carpeta_id) throw new Error("Este presupuesto no tiene carpeta todavía");
    const nueva = rutaReal(rutaCarpetaCliente(p.fecha_precision, p.fecha_evento, nombreCliente(p)));
    if (await elementoPorRuta(nueva)) throw new Error(`Ya existe una carpeta "${nueva}". Muévela a mano o dime cómo seguir.`);
    const partes = nueva.split("/");
    const nombre = partes.pop()!;
    const movida = await moverRenombrar(p.sp_carpeta_id, partes.join("/"), nombre);
    // Todas las opciones que comparten carpeta y sus documentos cambian de ruta
    const { data: hermanos } = await sb.from("presupuestos").select("id").eq("sp_carpeta_id", p.sp_carpeta_id);
    for (const h of hermanos ?? []) {
      await sb.from("presupuestos").update({ sp_carpeta_url: movida.webUrl, sp_carpeta_ruta: nueva }).eq("id", h.id);
      const { data: versiones } = await sb.from("presupuesto_versiones").select("id, docx_ruta").eq("presupuesto_id", h.id).not("docx_ruta", "is", null);
      for (const v of versiones ?? []) {
        const archivo = (v.docx_ruta as string).split("/").pop();
        await sb.from("presupuesto_versiones").update({ docx_ruta: `${nueva}/${archivo}` }).eq("id", v.id);
      }
    }
    return { ok: true, ruta: nueva };
  });
}

export async function estadoSharePoint(): Promise<{ configurado: boolean; raiz: string }> {
  await obtenerUsuario();
  return { configurado: sharepointConfigurado(), raiz: process.env.SP_RAIZ ?? "CARPA DIEM/00. CRM PRUEBAS" };
}

// Enlace para abrir un Word en el escritorio, desde la ruta guardada
export async function enlaceEscritorio(rutaArchivo: string): Promise<string> {
  await obtenerUsuario();
  return `ms-word:ofe|u|${await urlDirecta(rutaArchivo)}`;
}

// Guarda la hoja de montaje en la carpeta del cliente en SharePoint
export async function guardarHojaMontaje(eventoId: string): Promise<Resultado<{ nombre: string; webUrl: string }>> {
  return capturar(async () => {
    await obtenerUsuario();
    if (!sharepointConfigurado()) throw new ErrorSharePoint("SharePoint todavía no está configurado en el CRM. Usa Descargar o Compartir.");
    const sb = await crearClienteServidor();
    const datos = await cargarDatosHoja(sb, eventoId);
    if (!datos) throw new Error("Evento no encontrado");
    const ruta = datos.carpetaRuta
      ?? rutaReal(rutaCarpetaCliente(datos.fechaPrecision, datos.fechaInicio, datos.cliente));
    await asegurarCarpeta(ruta);
    const nombre = nombreArchivoHoja(datos);
    const item = await subir(`${ruta}/${nombre}`, await generarPdfHoja(datos), TIPO_PDF);
    const { error } = await sb.from("eventos").update({ hoja_montaje_url: item.webUrl, hoja_montaje_item_id: item.id }).eq("id", eventoId);
    if (error) throw new Error(error.message);
    return { ok: true, nombre, webUrl: item.webUrl };
  });
}
