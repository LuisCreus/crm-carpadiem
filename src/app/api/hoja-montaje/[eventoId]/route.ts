import { NextResponse, type NextRequest } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { cargarDatosHoja, generarPdfHoja, nombreArchivoHoja } from "@/lib/hoja-montaje";

// Hoja de montaje en PDF, generada al momento (para descargar o compartir)
export async function GET(request: NextRequest, { params }: RouteContext<"/api/hoja-montaje/[eventoId]">) {
  const { eventoId } = await params;
  const sb = await crearClienteServidor();
  const datos = await cargarDatosHoja(sb, eventoId);
  if (!datos) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });

  const pdf = await generarPdfHoja(datos);
  const enLinea = request.nextUrl.searchParams.get("ver") === "1";
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${enLinea ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(nombreArchivoHoja(datos))}`,
      "Cache-Control": "private, no-store",
    },
  });
}
