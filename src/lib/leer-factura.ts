// Lee los datos principales de una factura en PDF a partir de su texto (gratis, sin IA):
// NIF, IBAN, número, fecha, base, IVA, IRPF y total. Sirve para PDF "de verdad"
// (los que se pueden seleccionar con el ratón); de fotos o escaneos no se puede leer.

import { leerEuros } from "@/lib/formato";

// Los datos de Carpa Diem salen en las facturas que nos mandan: no son del proveedor
const NIF_PROPIO = "B26815829";
const IBAN_PROPIO = "ES3300495119172117161045";

export type DatosLeidos = {
  nif: string | null;
  iban: string | null;
  numero: string | null;
  fecha: string | null; // aaaa-mm-dd
  base: number | null;
  ivaPct: number | null;
  irpfPct: number | null;
  total: number | null;
};

const limpio = (s: string) => s.replace(/[\s.-]/g, "").toUpperCase();

// IBAN válido (comprobación oficial mod 97)
export function ibanValido(iban: string): boolean {
  const s = limpio(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const reordenado = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (l) => String(l.charCodeAt(0) - 55));
  let resto = 0;
  for (const d of reordenado) resto = (resto * 10 + Number(d)) % 97;
  return resto === 1;
}

export function formatoIban(iban: string): string {
  return limpio(iban).replace(/(.{4})/g, "$1 ").trim();
}

// Los IBAN aparecen agrupados de muchas formas ("ES48 1465 02 0021…"): se juntan las cifras y se prueba
function buscarIban(texto: string): string | null {
  for (const m of texto.matchAll(/\b([A-Z]{2})[\s-]?(\d{2}(?:[\s-]?[A-Z0-9]){10,30})/g)) {
    const seguido = limpio(m[1] + m[2]);
    const largos = m[1] === "ES" ? [24] : Array.from({ length: 19 }, (_, i) => 34 - i);
    for (const largo of largos) {
      const iban = seguido.slice(0, largo);
      if (iban.length === largo && iban !== IBAN_PROPIO && ibanValido(iban)) return formatoIban(iban);
    }
  }
  return null;
}

// DNI (12345678Z), NIE (X1234567L) o CIF (B12345678)
function buscarNif(texto: string): string | null {
  for (const m of texto.matchAll(/\b(?:ES)?([A-HJ-NP-SUVW][-\s.]?\d{7}[-\s.]?[0-9A-J]|\d{2}\.?\d{3}\.?\d{3}[-\s]?[A-Z]|[XYZ][-\s]?\d{7}[-\s]?[A-Z])\b/gi)) {
    const nif = limpio(m[1]);
    if (nif !== NIF_PROPIO) return nif;
  }
  return null;
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function buscarFecha(texto: string): string | null {
  // "27-oct.-2026", "5 de noviembre de 2026"
  const conMes = texto.match(/\b(\d{1,2})[\s.\/-]*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z.]*[\s.\/-]*(?:de\s+)?(\d{4})\b/i);
  const numerica = texto.match(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/);
  if (conMes && (!numerica || (conMes.index ?? 0) < (numerica.index ?? 0))) {
    const mes = MESES_CORTOS.indexOf(conMes[2].toLowerCase()) + 1;
    return `${conMes[3]}-${String(mes).padStart(2, "0")}-${conMes[1].padStart(2, "0")}`;
  }
  const fechas = [...texto.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)];
  // Mejor la que va junto a "fecha"; si no, la primera
  const junto = texto.match(/fecha[^\d]{0,25}(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/i);
  const m = junto ?? fechas[0];
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3].length === 2 ? `20${m[3]}` : m[3])];
  if (d < 1 || d > 31 || mes < 1 || mes > 12) return null;
  return `${a}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function buscarNumero(texto: string): string | null {
  const patrones = [
    /(?:n[º°]\s*(?:de\s*)?factura|número de factura)\s*[:.]?\s*([A-Z0-9][A-Z0-9/.\-]{0,20})/gi,
    /(?:factura|fra\.?|invoice)\s*(?:n[º°o.]*|núm(?:ero)?\.?|number|#)?\s*[:.]?\s*([A-Z0-9][A-Z0-9/.\-]{0,20})/gi,
  ];
  for (const re of patrones) {
    for (const m of texto.matchAll(re)) {
      // "GS 2026/217": si la primera parte no lleva cifras, se añade la siguiente
      const partes = texto.slice((m.index ?? 0) + m[0].length - m[1].length).split(/\s+/);
      const n = (/\d/.test(partes[0]) ? partes[0] : `${partes[0]} ${partes[1] ?? ""}`).trim().replace(/[.\-/:]+$/, "");
      // Tiene que llevar algún número y no ser una fecha ("Fecha de factura 13-06-2026")
      if (/\d/.test(n) && !/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(n)) return n;
    }
  }
  return null;
}

// Un importe (y que no sea un porcentaje: "IVA 21% 450,00 €")
const IMPORTE = String.raw`(-?\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|-?\d+(?:[.,]\d{1,2})?)(?![\d.,]*\s*%)\s*€?`;

// Importe que sigue a una etiqueta ("Base imponible 1.000,00 €"). Se prueban las etiquetas por orden
// de preferencia; con cada una se queda el último importe que aparece.
function importeTras(texto: string, etiquetas: RegExp[]): number | null {
  for (const etiqueta of etiquetas) {
    const re = new RegExp(`(?:${etiqueta.source})(?:[^\\d\\n-]|\\d{1,2}(?:[.,]\\d+)?\\s*%){0,40}?${IMPORTE}`, "gi");
    let ultimo: number | null = null;
    for (const m of texto.matchAll(re)) {
      const v = leerEuros(m[1].replace(/\s/g, ""));
      if (v !== null) ultimo = Math.abs(v);
    }
    if (ultimo !== null) return ultimo;
  }
  return null;
}

function porcentajeTras(texto: string, etiqueta: RegExp): number | null {
  const m = texto.match(new RegExp(`(?:${etiqueta.source})[^\\d\\n]{0,15}(\\d{1,2}(?:[.,]\\d{1,2})?)\\s*%`, "i"))
    ?? texto.match(new RegExp(`(\\d{1,2}(?:[.,]\\d{1,2})?)\\s*%\\s*(?:de\\s*)?(?:${etiqueta.source})`, "i"));
  return m ? Number(m[1].replace(",", ".")) : null;
}

export function leerDatosFactura(texto: string): DatosLeidos {
  const t = texto.replace(/ /g, " ");
  const base = importeTras(t, [/base\s*imponible/, /total\s*sujeto\s*al\s*i\.?v\.?a/, /importe\s*neto|total\s*honorarios|total\s*importes\s*brutos/, /subtotal/, /\bbase\b/]);
  const total = importeTras(t, [/total\s*factura(?:\s*en\s*euros)?/, /importe\s*a\s*pagar|total\s*a\s*pagar|importe\s*total/, /\btotal\b/]);
  let ivaPct = porcentajeTras(t, /i\.?v\.?a\.?/);
  let irpfPct = porcentajeTras(t, /i\.?r\.?p\.?f\.?|retenci[oó]n/);
  // Si no pone los % pero sí la base y el total, se deducen (IVA 21/10/4/0 % y retención 0/15/7/19 %)
  if ((ivaPct === null || irpfPct === null) && base && total) {
    for (const iva of ivaPct !== null ? [ivaPct] : [21, 10, 4, 0]) {
      const irpf = (irpfPct !== null ? [irpfPct] : [0, 15, 7, 19]).find((x) => Math.abs(base * (1 + iva / 100 - x / 100) - total) < 0.05);
      if (irpf !== undefined) {
        ivaPct = iva;
        irpfPct = irpf || null;
        break;
      }
    }
  }
  return { nif: buscarNif(t), iban: buscarIban(t), numero: buscarNumero(t), fecha: buscarFecha(t), base, ivaPct, irpfPct, total };
}
