// Lectura de los movimientos que se descargan de Santander Empresas:
//   · Norma 43 (Cuaderno 43 de la AEB, el formato estándar de los bancos españoles), o
//   · Excel / CSV con columnas de fecha, concepto e importe (se buscan por su título).

import { leerEuros } from "@/lib/formato";

export type Movimiento = {
  fecha: string; // aaaa-mm-dd (operación)
  fechaValor: string | null;
  concepto: string;
  importe: number; // positivo = entra dinero; negativo = sale
  saldo: number | null;
  referencia: string | null;
};

const fechaAammdd = (s: string) => (/^\d{6}$/.test(s) ? `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}` : null);

// ---------------------------------------------------------------------
// Norma 43: líneas de 80 caracteres. 22 = movimiento, 23 = concepto complementario.
// ---------------------------------------------------------------------
export function esNorma43(texto: string): boolean {
  const primera = texto.split(/\r?\n/).find((l) => l.trim());
  return Boolean(primera && /^11\d{18}/.test(primera));
}

export function leerNorma43(texto: string): Movimiento[] {
  const movimientos: Movimiento[] = [];
  let saldo: number | null = null;
  for (const linea of texto.split(/\r?\n/)) {
    const tipo = linea.slice(0, 2);
    if (tipo === "11") {
      // Saldo inicial de la cuenta: clave (1 debe, 2 haber) + 14 dígitos con 2 decimales
      const signo = linea.slice(32, 33) === "1" ? -1 : 1;
      saldo = signo * Number(linea.slice(33, 47)) / 100;
    } else if (tipo === "22") {
      const signo = linea.slice(27, 28) === "1" ? -1 : 1;
      const importe = signo * Number(linea.slice(28, 42)) / 100;
      saldo = saldo !== null ? Math.round((saldo + importe) * 100) / 100 : null;
      const referencia = [linea.slice(52, 64), linea.slice(64, 80)].map((x) => x.trim()).filter((x) => x && !/^0+$/.test(x)).join(" ") || null;
      movimientos.push({
        fecha: fechaAammdd(linea.slice(10, 16)) ?? "",
        fechaValor: fechaAammdd(linea.slice(16, 22)),
        concepto: "",
        importe,
        saldo,
        referencia,
      });
    } else if (tipo === "23" && movimientos.length) {
      const ultimo = movimientos[movimientos.length - 1];
      ultimo.concepto = `${ultimo.concepto} ${linea.slice(4, 42)} ${linea.slice(42, 80)}`.replace(/\s+/g, " ").trim();
    }
  }
  return movimientos.filter((m) => m.fecha).map((m) => ({ ...m, concepto: m.concepto || m.referencia || "Movimiento" }));
}

// ---------------------------------------------------------------------
// Tabla (Excel o CSV): se busca la fila de títulos y las columnas por su nombre
// ---------------------------------------------------------------------
type Celda = string | number | Date | null | undefined;

const normal = (s: Celda) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

function leerFecha(v: Celda): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 30000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  const m = String(v ?? "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const iso = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

function leerImporte(v: Celda): number | null {
  if (typeof v === "number") return v;
  const t = String(v ?? "").replace(/\s|EUR|€/gi, "");
  if (!t) return null;
  if (/^-?\d+\.\d{1,2}$/.test(t)) return Number(t); // "1234.56"
  return leerEuros(t);
}

export function leerTabla(filas: Celda[][]): Movimiento[] {
  const cabecera = filas.findIndex((f) => {
    const t = f.map(normal);
    return t.some((c) => c.includes("fecha")) && t.some((c) => c.includes("importe") || c === "cargo" || c === "abono");
  });
  if (cabecera < 0) throw new Error("No encuentro las columnas de fecha e importe en el fichero");
  const titulos = filas[cabecera].map(normal);
  const col = (...nombres: string[]) => titulos.findIndex((t) => nombres.some((n) => t === n || t.startsWith(n)));
  const cFecha = col("fecha operacion", "fecha de operacion", "f. operacion", "fecha");
  const cValor = col("fecha valor", "f. valor");
  const cConcepto = col("concepto", "descripcion", "detalle", "movimiento");
  const cImporte = col("importe");
  const cCargo = col("cargo", "debe");
  const cAbono = col("abono", "haber");
  const cSaldo = col("saldo");
  const cRef = col("referencia", "observaciones", "informacion adicional", "mas datos");

  const movimientos: Movimiento[] = [];
  for (const f of filas.slice(cabecera + 1)) {
    const fecha = leerFecha(f[cFecha]);
    if (!fecha) continue;
    let importe = cImporte >= 0 ? leerImporte(f[cImporte]) : null;
    if (importe === null && (cCargo >= 0 || cAbono >= 0)) {
      const cargo = cCargo >= 0 ? leerImporte(f[cCargo]) : null;
      const abono = cAbono >= 0 ? leerImporte(f[cAbono]) : null;
      importe = abono ? Math.abs(abono) : cargo ? -Math.abs(cargo) : null;
    }
    if (importe === null || importe === 0) continue;
    movimientos.push({
      fecha,
      fechaValor: cValor >= 0 && cValor !== cFecha ? leerFecha(f[cValor]) : null,
      concepto: [cConcepto >= 0 ? f[cConcepto] : "", cRef >= 0 && cRef !== cConcepto ? f[cRef] : ""].map((x) => String(x ?? "").trim()).filter(Boolean).join(" · ") || "Movimiento",
      importe,
      saldo: cSaldo >= 0 ? leerImporte(f[cSaldo]) : null,
      referencia: null,
    });
  }
  return movimientos;
}

export function leerCsv(texto: string): Movimiento[] {
  const separador = (texto.match(/;/g)?.length ?? 0) > (texto.match(/,/g)?.length ?? 0) ? ";" : texto.includes("\t") ? "\t" : ",";
  const filas = texto.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(separador).map((c) => c.replace(/^"|"$/g, "").trim()));
  return leerTabla(filas);
}

// Huella de cada movimiento: al subir otra vez el mismo extracto no se duplica
export function huella(m: Movimiento): string {
  return [m.fecha, m.importe.toFixed(2), m.saldo?.toFixed(2) ?? "", normal(m.concepto).replace(/\s+/g, " ")].join("|");
}

// Algunos bancos descargan un ".xls" que en realidad es una tabla HTML
export function leerHtml(html: string): Movimiento[] {
  const limpiar = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const filas = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(([tr]) => [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => limpiar(c[1])));
  return leerTabla(filas);
}
