import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { obtenerUsuario } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esNorma43, huella, leerCsv, leerHtml, leerNorma43, leerTabla, type Movimiento } from "@/lib/extracto-banco";
// Generar documentos con Microsoft puede tardar: hasta 60 sexport const maxDuration = 60;

// Sube el extracto del Santander (Norma 43, Excel .xlsx, CSV o el ".xls" en HTML) y guarda
// los movimientos nuevos. Los que ya estaban (misma huella) no se repiten.
export async function POST(request: NextRequest) {
  await obtenerUsuario();
  const archivo = (await request.formData()).get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (archivo.size > 4 * 1024 * 1024) return NextResponse.json({ error: "El fichero pesa más de 4 MB: descarga menos meses" }, { status: 413 });
  const bytes = new Uint8Array(await archivo.arrayBuffer());

  let movimientos: Movimiento[];
  try {
    movimientos = await leer(bytes);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer el fichero" }, { status: 400 });
  }
  if (!movimientos.length) return NextResponse.json({ error: "El fichero no tiene movimientos" }, { status: 400 });

  // Dos movimientos idénticos en el mismo fichero (p. ej. dos recibos iguales el mismo día) no son el mismo
  const vistas = new Map<string, number>();
  const filas = movimientos.map((m) => {
    const h = huella(m);
    const n = (vistas.get(h) ?? 0) + 1;
    vistas.set(h, n);
    return {
      fecha: m.fecha, fecha_valor: m.fechaValor, concepto: m.concepto, importe: m.importe,
      saldo: m.saldo, referencia: m.referencia, huella: n > 1 ? `${h}#${n}` : h,
    };
  });

  const sb = await crearClienteServidor();
  // El mismo movimiento subido antes en otro formato (Norma 43 / Excel) trae otro concepto:
  // se reconoce por fecha + importe + saldo (o + concepto si el fichero no trae saldo)
  const fechas = movimientos.map((m) => m.fecha).sort();
  const { data: previos, error: e1 } = await sb.from("movimientos_banco").select("fecha, importe, saldo, concepto")
    .gte("fecha", fechas[0]).lte("fecha", fechas[fechas.length - 1]);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  const clave = (m: { fecha: string; importe: number; saldo: number | null; concepto: string }) =>
    m.saldo !== null ? `${m.fecha}|${Number(m.importe).toFixed(2)}|${Number(m.saldo).toFixed(2)}` : huella({ ...m, fechaValor: null, referencia: null, importe: Number(m.importe) });
  const yaEstan = new Set((previos ?? []).map((p) => clave({ ...p, saldo: p.saldo === null ? null : Number(p.saldo) })));
  const nuevas = filas.filter((f) => !yaEstan.has(clave(f)));
  const { data, error } = nuevas.length
    ? await sb.from("movimientos_banco").upsert(nuevas, { onConflict: "huella", ignoreDuplicates: true }).select("id")
    : { data: [], error: null };
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leidos: movimientos.length, nuevos: data?.length ?? 0, desde: fechas[0], hasta: fechas[fechas.length - 1] });
}

async function leer(bytes: Uint8Array): Promise<Movimiento[]> {
  // .xlsx (es un zip: empieza por "PK")
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(bytes.buffer as ArrayBuffer);
    const hoja = libro.worksheets[0];
    const filas: (string | number | Date | null)[][] = [];
    hoja.eachRow({ includeEmpty: true }, (fila) => {
      const valores = (fila.values as ExcelJS.CellValue[]).slice(1);
      filas.push(valores.map(celda));
    });
    return leerTabla(filas);
  }
  // .xls antiguo (formato binario de Excel 97)
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    throw new Error("Este Excel es del formato antiguo (.xls). Descárgalo en Norma 43, o ábrelo y guárdalo como .xlsx.");
  }
  const texto = decodificar(bytes);
  if (esNorma43(texto)) return leerNorma43(texto);
  if (/<table/i.test(texto)) return leerHtml(texto);
  return leerCsv(texto);
}

// Los ficheros del banco suelen venir en Latin-1, no en UTF-8
function decodificar(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function celda(v: ExcelJS.CellValue): string | number | Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "object") {
    if ("result" in v) return celda(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
  }
  return String(v);
}
