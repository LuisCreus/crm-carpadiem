import { NextResponse, type NextRequest } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { descargar } from "@/lib/graph/sharepoint";

// Descarga el PDF de una factura (para "PDF" y "Compartir" en el móvil)
export async function GET(request: NextRequest, { params }: RouteContext<"/api/factura/[facturaId]">) {
  const { facturaId } = await params;
  const sb = await crearClienteServidor();
  const { data: f } = await sb.from("facturas").select("pdf_item_id, pdf_nombre, codigo").eq("id", facturaId).maybeSingle();
  if (!f?.pdf_item_id) return NextResponse.json({ error: "Esta factura no tiene PDF" }, { status: 404 });

  const contenido = await descargar(f.pdf_item_id);
  const nombre = f.pdf_nombre ?? `FACTURA ${f.codigo}.pdf`;
  const enLinea = request.nextUrl.searchParams.get("ver") === "1";
  return new NextResponse(contenido as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${enLinea ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
