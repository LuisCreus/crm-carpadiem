import { NextResponse, type NextRequest } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { obtenerUsuario } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { leerDatosFactura } from "@/lib/leer-factura";
// Generar documentos con Microsoft puede tardar: hasta 60 sexport const maxDuration = 60;

// Lee el texto de una factura en PDF y saca sus datos principales (no guarda nada).
// Si el NIF o el IBAN coinciden con un proveedor guardado, lo devuelve también.
export async function POST(request: NextRequest) {
  await obtenerUsuario();
  const archivo = (await request.formData()).get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (archivo.size > 4 * 1024 * 1024) return NextResponse.json({ sinTexto: true, motivo: "grande" });
  if (!/pdf$/i.test(archivo.type) && !/\.pdf$/i.test(archivo.name)) return NextResponse.json({ sinTexto: true, motivo: "foto" });

  let texto = "";
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await archivo.arrayBuffer()));
    texto = (await extractText(pdf, { mergePages: true })).text;
  } catch {
    return NextResponse.json({ sinTexto: true, motivo: "ilegible" });
  }
  if (texto.replace(/\s/g, "").length < 20) return NextResponse.json({ sinTexto: true, motivo: "escaneado" });

  const datos = leerDatosFactura(texto);
  const sb = await crearClienteServidor();
  let proveedor = null;
  for (const [campo, valor] of [["nif", datos.nif], ["iban", datos.iban]] as const) {
    if (!valor || proveedor) continue;
    const { data } = await sb.from("proveedores").select("id, nombre, nif, iban, email, categoria").is("deleted_at", null).eq(campo, valor).limit(1).maybeSingle();
    proveedor = data;
  }
  return NextResponse.json({ datos, proveedor });
}
