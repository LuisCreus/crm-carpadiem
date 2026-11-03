"use server";

// "Pasar a la gestoría" de un trimestre: se mueven los PDF de 01. PENDIENTE SARA a su
// carpeta de trimestre, se marcan las facturas como pasadas, se genera el Excel resumen
// y se prepara un borrador en Outlook (el destinatario lo pone el usuario si no hay email en Ajustes).

import { obtenerUsuario } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  TIPO_XLSX, asegurarCarpeta, elementoPorId, elementoPorRuta, listarCarpeta, moverRenombrar, rutaReal, sharepointConfigurado, subir,
} from "@/lib/graph/sharepoint";
import { correoConfigurado, crearBorrador } from "@/lib/graph/correo";
import { CARPETA_PENDIENTE_SARA, carpetaTrimestre, excelTrimestre, nombreExcelTrimestre } from "@/lib/gestoria-excel";
import { ESTADOS_FACTURA, totalFactura } from "@/lib/facturacion";
import { rangoTrimestre } from "@/lib/rentabilidad";
import { uno } from "@/lib/datos/tipos";

export type Ubicacion = "pendiente" | "trimestre" | "otra" | "sin_archivo";
export type FilaGestoria = {
  id: string; tipo: "emitida" | "recibida"; nombre: string; detalle: string; fecha: string; total: number;
  archivo: string | null; ubicacion: Ubicacion; pasadaAt: string | null;
};
export type Trimestre = { filas: FilaGestoria[]; sueltos: string[]; emailGestoria: string | null; correo: boolean };

const redondear = (n: number) => Math.round(n * 100) / 100;

async function cargar(anio: number, t: number) {
  const sb = await crearClienteServidor();
  const { desde, hasta } = rangoTrimestre(anio, t);
  const [em, re, aj] = await Promise.all([
    sb.from("facturas").select("id, codigo, numero, fecha_emision, fact_nombre, fact_nif, concepto, importe, iva_pct, suplidos, estado, pdf_item_id, pdf_nombre, gestoria_at")
      .is("deleted_at", null).neq("estado", "prevista").gte("fecha_emision", desde).lte("fecha_emision", hasta).order("numero"),
    sb.from("facturas_recibidas").select("id, numero, fecha, concepto, base, iva_pct, irpf_pct, total, estado, archivo_item_id, archivo_nombre, gestoria_at, proveedor:proveedores(nombre, nif)")
      .is("deleted_at", null).gte("fecha", desde).lte("fecha", hasta).order("fecha"),
    sb.from("ajustes").select("email_gestoria").maybeSingle(),
  ]);
  if (em.error) throw new Error(em.error.message);
  if (re.error) throw new Error(re.error.message);
  return { sb, emitidas: em.data ?? [], recibidas: re.data ?? [], emailGestoria: (aj.data?.email_gestoria as string | null) ?? null };
}

// Dónde está ahora el PDF (Sara puede haberlo movido ya a mano)
async function ubicacion(itemId: string | null, anio: number, t: number): Promise<Ubicacion> {
  if (!itemId) return "sin_archivo";
  const e = await elementoPorId(itemId);
  const ruta = decodeURIComponent(e?.parentReference?.path ?? "");
  if (!e) return "sin_archivo";
  if (ruta.includes("01. PENDIENTE SARA")) return "pendiente";
  if (ruta.includes(`${anio}/${t} TRIMESTRE`)) return "trimestre";
  return "otra";
}

export async function verTrimestre(anio: number, t: number): Promise<{ ok: true; datos: Trimestre } | { ok: false; error: string }> {
  try {
    if (!(await obtenerUsuario()).esAdmin) return { ok: false, error: "Solo el administrador" };
    if (!sharepointConfigurado()) throw new Error("SharePoint no está configurado");
    const { emitidas, recibidas, emailGestoria } = await cargar(anio, t);
    const filas: FilaGestoria[] = [];
    for (const f of emitidas) {
      filas.push({
        id: f.id, tipo: "emitida", nombre: `${f.codigo} · ${f.fact_nombre ?? ""}`, detalle: f.concepto ?? "", fecha: f.fecha_emision!,
        total: totalFactura({ importe: Number(f.importe), iva_pct: Number(f.iva_pct), suplidos: Number(f.suplidos) }).total,
        archivo: f.pdf_nombre, ubicacion: await ubicacion(f.pdf_item_id, anio, t), pasadaAt: f.gestoria_at,
      });
    }
    for (const g of recibidas) {
      const p = uno(g.proveedor) as { nombre: string } | null;
      filas.push({
        id: g.id, tipo: "recibida", nombre: `${p?.nombre ?? "Proveedor"}${g.numero ? ` · nº ${g.numero}` : ""}`, detalle: g.concepto ?? "", fecha: g.fecha,
        total: Number(g.total), archivo: g.archivo_nombre, ubicacion: await ubicacion(g.archivo_item_id, anio, t), pasadaAt: g.gestoria_at,
      });
    }
    // Archivos de PENDIENTE SARA que no son de ninguna factura del CRM (no se mueven)
    const conocidos = new Set([...emitidas.map((f) => f.pdf_nombre), ...recibidas.map((g) => g.archivo_nombre)].filter(Boolean));
    const sueltos: string[] = [];
    for (const sub of ["01. EMITIDAS", "02. RECIBIDAS"]) {
      for (const a of await listarCarpeta(rutaReal(`${CARPETA_PENDIENTE_SARA}/${sub}`))) if (!conocidos.has(a.name)) sueltos.push(`${sub}/${a.name}`);
    }
    return { ok: true, datos: { filas, sueltos, emailGestoria, correo: correoConfigurado() } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido" };
  }
}

// Mueve un archivo a su carpeta de trimestre; si ya hay uno con ese nombre, añade " (2)"
async function mover(itemId: string, carpeta: string, nombre: string) {
  await asegurarCarpeta(carpeta);
  const punto = nombre.lastIndexOf(".");
  const [base, ext] = punto > 0 ? [nombre.slice(0, punto), nombre.slice(punto)] : [nombre, ""];
  let destino = nombre;
  for (let i = 2; await elementoPorRuta(`${carpeta}/${destino}`); i++) destino = `${base} (${i})${ext}`;
  return moverRenombrar(itemId, carpeta, destino);
}

export async function pasarTrimestre(anio: number, t: number): Promise<{ ok: true; movidos: number; marcadas: number; excelUrl: string; borrador: string | null } | { ok: false; error: string }> {
  try {
    if (!(await obtenerUsuario()).esAdmin) return { ok: false, error: "Solo el administrador" };
    const { sb, emitidas, recibidas, emailGestoria } = await cargar(anio, t);
    const carpeta = rutaReal(carpetaTrimestre(anio, t));
    const ahora = new Date().toISOString();
    let movidos = 0;
    let marcadas = 0;

    for (const f of emitidas.filter((x) => !x.gestoria_at)) {
      if (f.pdf_item_id && (await ubicacion(f.pdf_item_id, anio, t)) === "pendiente") {
        await mover(f.pdf_item_id, `${carpeta}/01. EMITIDAS`, f.pdf_nombre ?? `FACTURA ${f.codigo}.pdf`);
        movidos++;
      }
      const r = await sb.from("facturas").update({ gestoria_at: ahora }).eq("id", f.id);
      if (r.error) throw new Error(r.error.message);
      marcadas++;
    }
    for (const g of recibidas.filter((x) => !x.gestoria_at)) {
      if (g.archivo_item_id && (await ubicacion(g.archivo_item_id, anio, t)) === "pendiente") {
        await mover(g.archivo_item_id, `${carpeta}/02. RECIBIDAS`, g.archivo_nombre ?? "Factura.pdf");
        movidos++;
      }
      const r = await sb.from("facturas_recibidas").update({ gestoria_at: ahora }).eq("id", g.id);
      if (r.error) throw new Error(r.error.message);
      marcadas++;
    }

    // Excel del trimestre completo (también lo que ya se pasó antes)
    const xlsx = await excelTrimestre(anio, t,
      emitidas.map((f) => {
        const imp = { importe: Number(f.importe), iva_pct: Number(f.iva_pct), suplidos: Number(f.suplidos) };
        const { iva, total } = totalFactura(imp);
        return { codigo: f.codigo!, fecha: f.fecha_emision!, nombre: f.fact_nombre ?? "", nif: f.fact_nif, concepto: f.concepto, base: imp.importe, ivaPct: imp.iva_pct, iva, suplidos: imp.suplidos, total, estado: ESTADOS_FACTURA[f.estado as keyof typeof ESTADOS_FACTURA]?.texto ?? f.estado };
      }),
      recibidas.map((g) => {
        const p = uno(g.proveedor) as { nombre: string; nif: string | null } | null;
        const base = Number(g.base);
        return { fecha: g.fecha, numero: g.numero, proveedor: p?.nombre ?? "", nif: p?.nif ?? null, concepto: g.concepto, base, ivaPct: Number(g.iva_pct), iva: redondear(base * Number(g.iva_pct) / 100), irpfPct: Number(g.irpf_pct), irpf: redondear(base * Number(g.irpf_pct) / 100), total: Number(g.total), estado: g.estado === "pagada" ? "Pagada" : "Por pagar" };
      }));
    await asegurarCarpeta(carpeta);
    const nombre = nombreExcelTrimestre(anio, t);
    const excel = await subir(`${carpeta}/${nombre}`, xlsx, TIPO_XLSX);

    // Borrador para la gestoría (sin destinatario si no hay email en Ajustes)
    let borrador: string | null = null;
    if (correoConfigurado()) {
      const b = await crearBorrador({
        para: emailGestoria ? [emailGestoria] : [],
        asunto: `Facturas Carpa Diem · ${t}º trimestre ${anio}`,
        texto: [
          "Hola,",
          "",
          `Te adjuntamos el resumen de las facturas emitidas y recibidas del ${t}º trimestre de ${anio}.`,
          `Los PDF están en SharePoint: 03. FINANCIERO/01. FACTURAS/${anio}/${t} TRIMESTRE.`,
          "",
          "Un saludo,",
          "Carpa Diem",
        ].join("\n"),
        adjuntos: [{ nombre, tipo: TIPO_XLSX, contenido: xlsx }],
      });
      borrador = b.webLink;
    }
    return { ok: true, movidos, marcadas, excelUrl: excel.webUrl, borrador };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido" };
  }
}
