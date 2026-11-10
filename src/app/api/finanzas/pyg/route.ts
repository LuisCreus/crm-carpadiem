import { NextResponse, type NextRequest } from "next/server";
import { exigirFinanzas } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { datosPyg, generarExcelPyg } from "@/lib/pyg-excel";

export const maxDuration = 60;

// "Descargar en Excel" de Finanzas → P&L (administrador y socios): mismo formato que la hoja P&L del Excel contable
export async function GET(request: NextRequest) {
  await exigirFinanzas();
  const anio = Number(request.nextUrl.searchParams.get("anio"));
  if (!Number.isInteger(anio) || anio < 2026 || anio > 2100) return NextResponse.json({ error: "Año no válido" }, { status: 400 });
  const xlsx = await generarExcelPyg(anio, await datosPyg(await crearClienteServidor(), anio));
  return new NextResponse(xlsx as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`P&L Carpadiem Ibérica ${anio}.xlsx`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
