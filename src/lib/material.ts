// Material «a grosso modo» de un presupuesto: carpas beduinas, modulares, m² de tarima y sombrillas.
// Es lo único que se cuenta para avisar de que no hay material suficiente un día (lo pequeño, no).
// Se rellena leyendo el texto del material ("2 carpas beduinas 12x15 + Tarima 72 m2") y se puede corregir.

export type Recurso = "beduinas" | "modulares" | "tarima_m2" | "sombrillas";
export type Cantidades = Record<Recurso, number>;

export const RECURSOS: { clave: Recurso; nombre: string; corto: string; uno: string; unidad: string }[] = [
  { clave: "beduinas", nombre: "Carpas beduinas", corto: "beduinas", uno: "beduina", unidad: "ud" },
  { clave: "modulares", nombre: "Carpas modulares", corto: "modulares", uno: "modular", unidad: "ud" },
  { clave: "tarima_m2", nombre: "Tarima", corto: "m² de tarima", uno: "m² de tarima", unidad: "m²" },
  { clave: "sombrillas", nombre: "Sombrillas", corto: "sombrillas", uno: "sombrilla", unidad: "ud" },
];

export const SIN_MATERIAL: Cantidades = { beduinas: 0, modulares: 0, tarima_m2: 0, sombrillas: 0 };

const NUMEROS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
const normal = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function leerMaterial(texto: string | null | undefined): Cantidades {
  const r = { ...SIN_MATERIAL };
  if (!texto) return r;
  // Cada trozo separado por "+", ",", ";" o " y " es una cosa
  for (const trozo of normal(texto).split(/\s*(?:\+|,|;|\by\b)\s*/)) {
    const t = trozo.trim();
    if (!t) continue;
    if (/tarima/.test(t)) {
      // "tarima 72 m2", "tarima de 180m²", "72 m2 de tarima"; "tarima 8x8" → 64
      const m2 = t.match(/(\d+(?:[.,]\d+)?)\s*m\s*(?:2|²)/);
      const lados = t.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/);
      if (m2) r.tarima_m2 += Number(m2[1].replace(",", "."));
      else if (lados) r.tarima_m2 += Number(lados[1].replace(",", ".")) * Number(lados[2].replace(",", "."));
      continue;
    }
    // Una medida suelta ("y 12x9") es la misma carpa de antes, no otra
    if (/^\d+(?:[.,]\d+)?\s*x\s*\d+/.test(t)) continue;
    const numero = t.match(/^(\d+)\s/) ?? t.match(/^(\d+)(?=[a-wyz])/);
    const palabra = t.match(/^([a-z]+)\s/);
    const conCantidad = Boolean(numero) || Boolean(palabra && NUMEROS[palabra[1]]);
    const cuantas = numero ? Number(numero[1]) : palabra && NUMEROS[palabra[1]] ? NUMEROS[palabra[1]] : 1;
    if (/sombrill/.test(t)) r.sombrillas += cuantas;
    else if (/modular|\b[3-6]\s*x\s*[3-6]\b/.test(t)) r.modulares += cuantas;
    // "carpa" a secas solo cuenta si empieza por la cantidad o la medida dice que es grande
    else if (/beduin|tenso\s*carpa|\b(9|12|15)\s*x\s*(6|9|10|12|15|24)\b/.test(t) || (conCantidad && /\bcarpas?\b/.test(t))) r.beduinas += cuantas;
  }
  return r;
}

// Las 4 casillas del presupuesto; si están a cero pero hay texto, se lee el texto
export type FilaCantidades = { uds_beduinas: number; uds_modulares: number; m2_tarima: number | string; uds_sombrillas: number; material: string | null };
export function cantidadesDe(p: FilaCantidades | null | undefined, texto?: string | null): Cantidades {
  if (p && (p.uds_beduinas || p.uds_modulares || Number(p.m2_tarima) || p.uds_sombrillas)) {
    return { beduinas: p.uds_beduinas, modulares: p.uds_modulares, tarima_m2: Number(p.m2_tarima), sombrillas: p.uds_sombrillas };
  }
  return leerMaterial(texto ?? p?.material);
}

// "2 beduinas · 1 modular · 72 m² de tarima"
export function textoCantidades(c: Cantidades): string {
  const partes = [
    c.beduinas && `${c.beduinas} ${c.beduinas === 1 ? "beduina" : "beduinas"}`,
    c.modulares && `${c.modulares} ${c.modulares === 1 ? "modular" : "modulares"}`,
    c.tarima_m2 && `${c.tarima_m2} m² de tarima`,
    c.sombrillas && `${c.sombrillas} ${c.sombrillas === 1 ? "sombrilla" : "sombrillas"}`,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Sin carpas ni tarima";
}

// Piezas para montar: cada carpa lleva su kit (piezas por unidad). Se redondea hacia arriba
// y nunca más de lo que hay en el almacén.
export type PiezaKit = { recurso: Recurso; inventarioId: string; material: string; porUnidad: number; stock: number; grupo: string | null };
export function piezasParaMontar(c: Cantidades, kit: PiezaKit[]): { material: string; cantidad: number; grupo: string | null; falta: number }[] {
  return kit
    .filter((p) => c[p.recurso] > 0 && p.porUnidad > 0)
    .map((p) => {
      const necesita = Math.ceil(p.porUnidad * c[p.recurso] - 1e-9);
      return { material: p.material, grupo: p.grupo, cantidad: necesita, falta: Math.max(0, necesita - p.stock) };
    });
}
