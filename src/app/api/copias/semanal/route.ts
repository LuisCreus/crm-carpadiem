import { NextResponse, type NextRequest } from "next/server";
import { crearClienteServicio } from "@/lib/supabase/servicio";
import { hacerCopia } from "@/lib/copias-servidor";

// Copia semanal automática: la llama Vercel cada lunes (ver vercel.json).
// Solo responde a quien traiga la clave CRON_SECRET.
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET?.trim();
  if (!secreto) {
    return NextResponse.json({ error: "Falta CRON_SECRET en la configuración del servidor" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const r = await hacerCopia(crearClienteServicio());
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
