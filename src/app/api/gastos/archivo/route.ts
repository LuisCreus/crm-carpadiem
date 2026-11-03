import { NextResponse, type NextRequest } from "next/server";
import { obtenerUsuario } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { asegurarCarpeta, descargar, elementoPorRuta, rutaReal, sharepointConfigurado, subir } from "@/lib/graph/sharepoint";
import { limpiarNombre } from "@/lib/negocio";
// Generar documentos con Microsoft puede tardar: hasta 60 s
export const maxDuration = 60;

// Facturas que nos llegan: se guardan donde las dejáis para la gestoría
const CARPETA_RECIBIDAS = "CARPA DIEM/03. FINANCIERO/01. FACTURAS/01. PENDIENTE SARA/02. RECIBIDAS";
const MAXIMO = 4 * 1024 * 1024;

// Sube el PDF o la foto de una factura recibida (no sustituye nunca un archivo que ya exista)
export async function POST(request: NextRequest) {
  await obtenerUsuario();
  if (!sharepointConfigurado()) return NextResponse.json({ error: "SharePoint no está configurado" }, { status: 503 });
  const datos = await request.formData();
  const archivo = datos.get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (archivo.size > MAXIMO) return NextResponse.json({ error: "El archivo pesa más de 4 MB" }, { status: 413 });

  const carpeta = rutaReal(CARPETA_RECIBIDAS);
  await asegurarCarpeta(carpeta);
  const punto = archivo.name.lastIndexOf(".");
  const base = limpiarNombre(punto > 0 ? archivo.name.slice(0, punto) : archivo.name) || "Factura";
  const extension = punto > 0 ? archivo.name.slice(punto).toLowerCase() : "";
  if (!/^\.(pdf|png|jpe?g|heic|heif|webp)$/.test(extension)) return NextResponse.json({ error: "Solo PDF o fotos (jpg, png, heic)" }, { status: 400 });
  let nombre = `${base}${extension}`;
  for (let i = 2; await elementoPorRuta(`${carpeta}/${nombre}`); i++) nombre = `${base} (${i})${extension}`;

  const item = await subir(`${carpeta}/${nombre}`, new Uint8Array(await archivo.arrayBuffer()), archivo.type || "application/octet-stream");
  return NextResponse.json({ id: item.id, url: item.webUrl, nombre });
}

// Descarga el archivo de una factura recibida
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta la factura" }, { status: 400 });
  const sb = await crearClienteServidor();
  const { data: f } = await sb.from("facturas_recibidas").select("archivo_item_id, archivo_nombre").eq("id", id).maybeSingle();
  if (!f?.archivo_item_id) return NextResponse.json({ error: "Esta factura no tiene archivo" }, { status: 404 });
  const contenido = await descargar(f.archivo_item_id);
  const nombre = f.archivo_nombre ?? "factura.pdf";
  const tipo = /\.pdf$/i.test(nombre) ? "application/pdf" : /\.png$/i.test(nombre) ? "image/png" : /\.jpe?g$/i.test(nombre) ? "image/jpeg" : "application/octet-stream";
  return new NextResponse(contenido as unknown as BodyInit, {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
