import { NextResponse, type NextRequest } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { descargar } from "@/lib/graph/sharepoint";

// Descarga el PDF de una versión (de SharePoint o, en el plan B, de Supabase Storage).
// Sirve para "Descargar PDF" y para "Compartir" en el móvil.
export async function GET(request: NextRequest, { params }: RouteContext<"/api/pdf/[versionId]">) {
  const { versionId } = await params;
  const sb = await crearClienteServidor();
  const { data: v } = await sb
    .from("presupuesto_versiones")
    .select("pdf_item_id, pdf_storage, nombre_archivo, version, presupuesto_id")
    .eq("id", versionId)
    .maybeSingle();
  if (!v) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const nombre = (v.nombre_archivo as string | null)?.replace(/\.docx$/i, ".pdf") ?? `presupuesto-V${v.version}.pdf`;
  let contenido: Uint8Array;
  if (v.pdf_item_id) {
    contenido = await descargar(v.pdf_item_id);
  } else if (v.pdf_storage) {
    const { data, error } = await sb.storage.from("documentos").download(v.pdf_storage);
    if (error || !data) return NextResponse.json({ error: "No se pudo descargar" }, { status: 502 });
    contenido = new Uint8Array(await data.arrayBuffer());
  } else {
    return NextResponse.json({ error: "Esta versión no tiene PDF" }, { status: 404 });
  }

  const enLinea = request.nextUrl.searchParams.get("ver") === "1";
  return new NextResponse(contenido as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${enLinea ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
