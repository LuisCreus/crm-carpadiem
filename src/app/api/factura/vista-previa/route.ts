import { NextResponse, type NextRequest } from "next/server";
import { obtenerUsuario } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { uno, type DatosFacturacion } from "@/lib/datos/tipos";
import { datosAlEmitir, pdfFactura } from "@/lib/facturas-pdf-servidor";
import { hoyMadrid } from "@/lib/formato";

const FISCALES = "fact_nombre, fact_nif, fact_domicilio, fact_cp_ciudad, fact_email";

// Vista previa de una factura por emitir, con el concepto escrito y el número que le tocaría.
// No guarda nada: solo devuelve el PDF para revisarlo antes de pulsar "Emitir".
export async function POST(request: NextRequest) {
  await obtenerUsuario();
  const { facturaId, concepto } = (await request.json()) as { facturaId: string; concepto: string };
  const sb = await crearClienteServidor();
  const { data: f } = await sb.from("facturas")
    .select(`estado, importe, iva_pct, suplidos, concepto, ${FISCALES}, evento:eventos(${FISCALES}, cliente:clientes(${FISCALES}))`)
    .eq("id", facturaId).maybeSingle();
  if (!f) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
  if (f.estado !== "prevista") return NextResponse.json({ error: "La factura ya está emitida" }, { status: 400 });

  const evento = uno(f.evento) as (DatosFacturacion & { cliente: unknown }) | null;
  const datos = datosAlEmitir(f as DatosFacturacion, evento, uno(evento?.cliente) as DatosFacturacion | null);
  if (!datos.fact_nombre || !datos.fact_nif) return NextResponse.json({ error: "Faltan los datos de facturación (nombre y NIF)" }, { status: 400 });

  const hoy = hoyMadrid();
  const anio = Number(hoy.slice(0, 4));
  const { data: n } = await sb.from("numeracion_facturas").select("ultimo_numero").eq("anio", anio).maybeSingle();
  try {
    const pdf = await pdfFactura({
      codigo: `CD ${anio}/${(n?.ultimo_numero ?? 0) + 1}`,
      fecha: hoy,
      nombre: datos.fact_nombre,
      domicilio: datos.fact_domicilio,
      cpCiudad: datos.fact_cp_ciudad,
      nif: datos.fact_nif,
      concepto: concepto?.trim() || f.concepto || "Honorarios correspondientes a servicio de CARPAS",
      importe: Number(f.importe),
      ivaPct: Number(f.iva_pct),
      suplidos: Number(f.suplidos),
    });
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo generar la vista previa" }, { status: 502 });
  }
}
