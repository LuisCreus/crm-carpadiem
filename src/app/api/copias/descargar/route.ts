import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { cargarDatosCopia } from "@/lib/copias-servidor";
import { generarExcelCopia, nombreCopia } from "@/lib/copias";

// "Descargar copia" (solo administrador): el mismo Excel, directamente al ordenador
export async function GET() {
  await exigirAdmin();
  const ahora = new Date();
  const xlsx = await generarExcelCopia(await cargarDatosCopia(await crearClienteServidor()), ahora);
  return new NextResponse(xlsx as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombreCopia(ahora))}`,
      "Cache-Control": "private, no-store",
    },
  });
}
