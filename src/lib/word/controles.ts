// Controles de contenido de Word (w:sdt con etiqueta) en archivos .docx.
//
// · insertarControles: prepara la plantilla del CRM a partir de la original,
//   envolviendo el valor de "Cliente:", "Fecha:", "Ubicación:", "Nº Presupuesto:"
//   y el % de la reserva en controles con etiqueta. No cambia nada más.
// · rellenarControles: escribe los datos en los controles. Los controles siguen
//   existiendo después, así que una copia se puede volver a rellenar (Duplicar).
// · leerControles / leerImporte: leen lo que hay en el documento.

import JSZip from "jszip";
import { DOMParser, XMLSerializer, type Document, type Element, type Node } from "@xmldom/xmldom";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export type Etiqueta = "cliente" | "fecha" | "ubicacion" | "numero" | "reserva";

export const ETIQUETAS: Record<Etiqueta, { alias: string; rotulo?: RegExp }> = {
  cliente: { alias: "Cliente", rotulo: /^\s*cliente\s*:/i },
  fecha: { alias: "Fecha", rotulo: /^\s*fecha\s*:/i },
  ubicacion: { alias: "Ubicación", rotulo: /^\s*ubicaci[oó]n\s*:/i },
  numero: { alias: "Nº Presupuesto", rotulo: /^\s*n[º°o]\.?\s*presupuesto\s*:/i },
  reserva: { alias: "% de reserva" },
};

// ---------------------------------------------------------------------
// Utilidades de XML
// ---------------------------------------------------------------------

const hijos = (n: Node | null): Element[] => {
  const r: Element[] = [];
  for (let c = n?.firstChild ?? null; c; c = c.nextSibling) if (c.nodeType === 1) r.push(c as Element);
  return r;
};
const hijo = (n: Node, nombre: string) => hijos(n).find((c) => c.localName === nombre) ?? null;
const todos = (n: Document | Element, nombre: string): Element[] =>
  Array.from(n.getElementsByTagNameNS(W, nombre) as unknown as ArrayLike<Element>);

function textoRun(r: Element): string {
  return todos(r, "t").map((t) => t.textContent ?? "").join("");
}

function textoParrafo(p: Element): string {
  return todos(p, "t").map((t) => t.textContent ?? "").join("");
}

// Runs "visibles" de un párrafo, en orden (también dentro de controles ya existentes)
function runsDe(p: Element): Element[] {
  return todos(p, "r");
}

function nuevoRun(doc: Document, rPr: Element | null, texto: string): Element {
  const r = doc.createElementNS(W, "w:r");
  if (rPr) r.appendChild(rPr.cloneNode(true));
  const t = doc.createElementNS(W, "w:t");
  t.setAttribute("xml:space", "preserve");
  t.appendChild(doc.createTextNode(texto));
  r.appendChild(t);
  return r;
}

// Parte un run en dos en la posición indicada (dentro de su texto). Devuelve [antes, después].
function partirRun(doc: Document, r: Element, pos: number): [Element, Element] {
  const texto = textoRun(r);
  const rPr = hijo(r, "rPr");
  const a = nuevoRun(doc, rPr, texto.slice(0, pos));
  const b = nuevoRun(doc, rPr, texto.slice(pos));
  r.parentNode!.insertBefore(a, r);
  r.parentNode!.insertBefore(b, r);
  r.parentNode!.removeChild(r);
  return [a, b];
}

let contadorId = 1000;

function crearSdt(doc: Document, etiqueta: Etiqueta): { sdt: Element; contenido: Element } {
  const sdt = doc.createElementNS(W, "w:sdt");
  const pr = doc.createElementNS(W, "w:sdtPr");
  const alias = doc.createElementNS(W, "w:alias");
  alias.setAttributeNS(W, "w:val", ETIQUETAS[etiqueta].alias);
  const tag = doc.createElementNS(W, "w:tag");
  tag.setAttributeNS(W, "w:val", etiqueta);
  const id = doc.createElementNS(W, "w:id");
  id.setAttributeNS(W, "w:val", String(contadorId++));
  pr.appendChild(alias);
  pr.appendChild(tag);
  pr.appendChild(id);
  pr.appendChild(doc.createElementNS(W, "w:text"));
  const contenido = doc.createElementNS(W, "w:sdtContent");
  sdt.appendChild(pr);
  sdt.appendChild(contenido);
  return { sdt, contenido };
}

// Envuelve el texto [inicio, fin) de un párrafo en un control de contenido
function envolverRango(doc: Document, p: Element, inicio: number, fin: number, etiqueta: Etiqueta): boolean {
  if (fin <= inicio) return false;
  // 1) Partir runs para que el rango empiece y acabe en un límite de run
  let pos = 0;
  for (const r of runsDe(p)) {
    const largo = textoRun(r).length;
    if (inicio > pos && inicio < pos + largo) {
      partirRun(doc, r, inicio - pos);
      return envolverRango(doc, p, inicio, fin, etiqueta);
    }
    if (fin > pos && fin < pos + largo) {
      partirRun(doc, r, fin - pos);
      return envolverRango(doc, p, inicio, fin, etiqueta);
    }
    pos += largo;
  }
  // 2) Recoger los runs del rango (deben ser hermanos para poder envolverlos)
  const elegidos: Element[] = [];
  pos = 0;
  for (const r of runsDe(p)) {
    const largo = textoRun(r).length;
    if (pos >= inicio && pos + largo <= fin && largo > 0) elegidos.push(r);
    pos += largo;
  }
  if (!elegidos.length || elegidos.some((r) => r.parentNode !== elegidos[0].parentNode)) return false;
  const { sdt, contenido } = crearSdt(doc, etiqueta);
  elegidos[0].parentNode!.insertBefore(sdt, elegidos[0]);
  for (const r of elegidos) contenido.appendChild(r);
  return true;
}

function yaTiene(doc: Document, etiqueta: Etiqueta) {
  return todos(doc, "tag").some((t) => t.getAttributeNS(W, "val") === etiqueta || t.getAttribute("w:val") === etiqueta);
}

// ---------------------------------------------------------------------
// Insertar controles (preparar plantilla)
// ---------------------------------------------------------------------

function insertarEnDocumento(doc: Document): Etiqueta[] {
  const hechos: Etiqueta[] = [];
  const parrafos = todos(doc, "p");

  for (const etiqueta of ["cliente", "fecha", "ubicacion", "numero"] as const) {
    if (yaTiene(doc, etiqueta)) { hechos.push(etiqueta); continue; }
    const rotulo = ETIQUETAS[etiqueta].rotulo!;
    for (const p of parrafos) {
      const texto = textoParrafo(p);
      const m = rotulo.exec(texto);
      if (!m) continue;
      let inicio = m.index + m[0].length;
      while (inicio < texto.length && /\s/.test(texto[inicio])) inicio++;
      let fin = texto.length;
      while (fin > inicio && /\s/.test(texto[fin - 1])) fin--;
      if (fin > inicio && envolverRango(doc, p, inicio, fin, etiqueta)) { hechos.push(etiqueta); break; }

      // El valor está en la celda de al lado de la tabla
      const celda = p.parentNode as Element | null;
      if (celda?.localName === "tc") {
        let siguiente = celda.nextSibling;
        while (siguiente && siguiente.nodeType !== 1) siguiente = siguiente.nextSibling;
        const p2 = siguiente ? hijo(siguiente, "p") : null;
        if (p2) {
          const t2 = textoParrafo(p2);
          const i2 = t2.length - t2.trimStart().length;
          if (envolverRango(doc, p2, i2, t2.trimEnd().length, etiqueta)) { hechos.push(etiqueta); break; }
        }
      }
    }
  }

  // % de reserva: el número de "El pago del 50% en depósito…"
  if (yaTiene(doc, "reserva")) hechos.push("reserva");
  else {
    for (const p of parrafos) {
      const texto = textoParrafo(p);
      const m = /pago del\s*(\d+(?:[.,]\d+)?)\s*%/i.exec(texto);
      if (!m) continue;
      const inicio = m.index + m[0].indexOf(m[1]);
      if (envolverRango(doc, p, inicio, inicio + m[1].length, "reserva")) { hechos.push("reserva"); break; }
    }
  }
  return hechos;
}

// ---------------------------------------------------------------------
// Rellenar y leer controles
// ---------------------------------------------------------------------

function tagDe(sdt: Element): string | null {
  const pr = hijo(sdt, "sdtPr");
  const tag = pr ? hijo(pr, "tag") : null;
  return tag ? tag.getAttributeNS(W, "val") || tag.getAttribute("w:val") : null;
}

function rellenarEnDocumento(doc: Document, valores: Partial<Record<Etiqueta, string>>): Etiqueta[] {
  const hechos: Etiqueta[] = [];
  for (const sdt of todos(doc, "sdt")) {
    const tag = tagDe(sdt) as Etiqueta | null;
    if (!tag || !(tag in valores) || valores[tag] === undefined) continue;
    const contenido = hijo(sdt, "sdtContent");
    if (!contenido) continue;
    const primerRun = todos(contenido, "r")[0] ?? null;
    const rPr = primerRun ? hijo(primerRun, "rPr") : null;
    const pr = hijo(sdt, "sdtPr");
    const marcador = pr ? hijo(pr, "showingPlcHdr") : null;
    if (marcador) pr!.removeChild(marcador);

    const parrafo = hijos(contenido).find((c) => c.localName === "p");
    if (parrafo) {
      // Control de bloque: dejar un solo párrafo con un solo run
      for (const c of hijos(contenido)) if (c !== parrafo) contenido.removeChild(c);
      for (const c of hijos(parrafo)) if (c.localName !== "pPr") parrafo.removeChild(c);
      parrafo.appendChild(nuevoRun(doc, rPr, valores[tag]!));
    } else {
      while (contenido.firstChild) contenido.removeChild(contenido.firstChild);
      contenido.appendChild(nuevoRun(doc, rPr, valores[tag]!));
    }
    hechos.push(tag);
  }
  return hechos;
}

// ---------------------------------------------------------------------
// API sobre el .docx completo
// ---------------------------------------------------------------------

const PARTES = /^word\/(document|header\d*|footer\d*)\.xml$/;

// Algunos Word guardan las partes con BOM (U+FEFF) delante de la declaración XML
const leerXml = (xml: string) => new DOMParser().parseFromString(xml.replace(/^﻿/, ""), "text/xml");

async function transformar(docx: Uint8Array | ArrayBuffer, fn: (doc: Document) => Etiqueta[]) {
  const zip = await JSZip.loadAsync(docx);
  const hechos = new Set<Etiqueta>();
  for (const nombre of Object.keys(zip.files).filter((n) => PARTES.test(n))) {
    const doc = leerXml(await zip.file(nombre)!.async("string"));
    const r = fn(doc);
    if (r.length) {
      r.forEach((e) => hechos.add(e));
      zip.file(nombre, new XMLSerializer().serializeToString(doc));
    }
  }
  const salida = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return { docx: salida, etiquetas: [...hechos] };
}

export async function insertarControles(docx: Uint8Array | ArrayBuffer) {
  return transformar(docx, insertarEnDocumento);
}

export async function rellenarControles(docx: Uint8Array | ArrayBuffer, valores: Partial<Record<Etiqueta, string>>) {
  return transformar(docx, (doc) => rellenarEnDocumento(doc, valores));
}

async function documentos(docx: Uint8Array | ArrayBuffer): Promise<Document[]> {
  const zip = await JSZip.loadAsync(docx);
  const res: Document[] = [];
  for (const nombre of Object.keys(zip.files).filter((n) => PARTES.test(n))) {
    res.push(leerXml(await zip.file(nombre)!.async("string")));
  }
  return res;
}

export async function leerControles(docx: Uint8Array | ArrayBuffer): Promise<Partial<Record<Etiqueta, string>>> {
  const valores: Partial<Record<Etiqueta, string>> = {};
  for (const doc of await documentos(docx)) {
    for (const sdt of todos(doc, "sdt")) {
      const tag = tagDe(sdt) as Etiqueta | null;
      const contenido = hijo(sdt, "sdtContent");
      if (tag && contenido) valores[tag] = todos(contenido, "t").map((t) => t.textContent ?? "").join("").trim();
    }
  }
  return valores;
}

// "1 3.246   €" → 13246 · "3.973,80 €" → 3973.8
export function numeroEspanol(texto: string): number | null {
  const m = /(\d[\d.]*(?:,\d+)?)/.exec(texto.replace(/\s+/g, ""));
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Lee el "TOTAL (SIN IVA)" y el % de reserva del documento
export async function leerImporte(docx: Uint8Array | ArrayBuffer): Promise<{ total: number | null; reservaPct: number | null }> {
  let total: number | null = null;
  let reservaPct: number | null = null;
  for (const doc of await documentos(docx)) {
    // El total suele estar en una fila de tabla: rótulo en una celda y cifra en otra
    for (const bloque of [...todos(doc, "tr"), ...todos(doc, "p")]) {
      if (total !== null) break;
      const texto = textoParrafo(bloque);
      const m = /total\s*\(\s*sin\s*iva\s*\)/i.exec(texto.replace(/\s+/g, " "));
      if (m) total = numeroEspanol(texto.replace(/\s+/g, " ").slice(m.index + m[0].length));
    }
    for (const p of todos(doc, "p")) {
      if (reservaPct !== null) break;
      const m = /pago del\s*(\d+(?:[.,]\d+)?)\s*%/i.exec(textoParrafo(p));
      if (m) reservaPct = Number(m[1].replace(",", "."));
    }
  }
  return { total, reservaPct };
}
