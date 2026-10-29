// Plantilla de factura en Excel (la hoja "Emitir" del Excel contable).
//
// · crearPlantillaFactura: saca la hoja "Emitir" a un libro propio SIN tocar el original,
//   conservando su diseño (estilos, bordes, el texto vertical del registro mercantil y el
//   área de impresión). Las fórmulas pasan a valores y no se copia ningún otro dato.
// · rellenarFactura: escribe los datos de una factura en las celdas de la plantilla.
// Se trabaja directamente con el XML del .xlsx para no perder nada del diseño.

import JSZip from "jszip";
import { DOMParser, XMLSerializer, type Document, type Element } from "@xmldom/xmldom";

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const leerXml = (xml: string) => new DOMParser().parseFromString(xml.replace(/^﻿/, ""), "text/xml");
const escribirXml = (doc: Document) => new XMLSerializer().serializeToString(doc);
const hijos = (el: Element, nombre: string) =>
  Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === nombre);
const todos = (doc: Document | Element, nombre: string) => Array.from(doc.getElementsByTagNameNS(NS, nombre));
const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TIPO = {
  hoja: "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
  libro: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
  tema: "application/vnd.openxmlformats-officedocument.theme+xml",
  estilos: "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml",
  dibujo: "application/vnd.openxmlformats-officedocument.drawing+xml",
  core: "application/vnd.openxmlformats-package.core-properties+xml",
  app: "application/vnd.openxmlformats-officedocument.extended-properties+xml",
};
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// Texto de una cadena compartida (<si>), con o sin formato enriquecido
function textoSi(si: Element) {
  return Array.from(si.getElementsByTagNameNS(NS, "t")).map((t) => t.textContent ?? "").join("");
}

// Deja una celda con un texto o un número fijo (sin fórmula), conservando su estilo
function ponerValor(doc: Document, c: Element, valor: string | number | null) {
  while (c.firstChild) c.removeChild(c.firstChild);
  c.removeAttribute("t");
  c.removeAttribute("cm");
  if (valor === null || valor === "") return;
  if (typeof valor === "number") {
    const v = doc.createElementNS(NS, "v");
    v.appendChild(doc.createTextNode(String(valor)));
    c.appendChild(v);
  } else {
    c.setAttribute("t", "inlineStr");
    const is = doc.createElementNS(NS, "is");
    const t = doc.createElementNS(NS, "t");
    t.setAttribute("xml:space", "preserve");
    t.appendChild(doc.createTextNode(valor));
    is.appendChild(t);
    c.appendChild(is);
  }
}

const columna = (ref: string) => ref.replace(/\d+/g, "");
const fila = (ref: string) => Number(ref.replace(/\D+/g, ""));
const numeroColumna = (col: string) => [...col].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0);

// Busca (o crea, en su sitio) la celda de una hoja
function celda(doc: Document, ref: string): Element {
  const existente = todos(doc, "c").find((c) => c.getAttribute("r") === ref);
  if (existente) return existente;
  const datos = todos(doc, "sheetData")[0];
  const n = fila(ref);
  let row = todos(datos, "row").find((r) => Number(r.getAttribute("r")) === n);
  if (!row) {
    row = doc.createElementNS(NS, "row");
    row.setAttribute("r", String(n));
    const siguiente = todos(datos, "row").find((r) => Number(r.getAttribute("r")) > n);
    datos.insertBefore(row, siguiente ?? null);
  }
  const c = doc.createElementNS(NS, "c");
  c.setAttribute("r", ref);
  const siguiente = hijos(row, "c").find((x) => numeroColumna(columna(x.getAttribute("r") ?? "")) > numeroColumna(columna(ref)));
  row.insertBefore(c, siguiente ?? null);
  return c;
}

export async function crearPlantillaFactura(original: Uint8Array | ArrayBuffer, nombreHoja = "Emitir"): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(original);
  const leer = async (ruta: string) => {
    const f = zip.file(ruta);
    if (!f) throw new Error(`Falta ${ruta} en el Excel`);
    return f.async("string");
  };

  // Hoja "Emitir" y sus relaciones
  const libro = leerXml(await leer("xl/workbook.xml"));
  const hojas = todos(libro, "sheet");
  const indice = hojas.findIndex((h) => h.getAttribute("name") === nombreHoja);
  if (indice < 0) throw new Error(`No encuentro la hoja "${nombreHoja}"`);
  const rid = hojas[indice].getAttributeNS(REL, "id");
  const relsLibro = leerXml(await leer("xl/_rels/workbook.xml.rels"));
  const rel = Array.from(relsLibro.getElementsByTagName("Relationship")).find((r) => r.getAttribute("Id") === rid)!;
  const rutaHoja = `xl/${rel.getAttribute("Target")!.replace(/^\/?xl\//, "")}`;
  const nombreArchivo = rutaHoja.split("/").pop()!;

  // Cadenas compartidas → texto dentro de cada celda; fórmulas → su último valor
  const compartidas = zip.file("xl/sharedStrings.xml")
    ? todos(leerXml(await leer("xl/sharedStrings.xml")), "si").map(textoSi) : [];
  const hoja = leerXml(await leer(rutaHoja));
  for (const c of todos(hoja, "c")) {
    const t = c.getAttribute("t");
    const v = hijos(c, "v")[0]?.textContent ?? null;
    const formula = hijos(c, "f").length > 0;
    if (t === "s" && v !== null) ponerValor(hoja, c, compartidas[Number(v)] ?? "");
    else if (formula && (t === "str" || t === "e")) ponerValor(hoja, c, t === "e" ? "" : v ?? "");
    else if (formula) ponerValor(hoja, c, v !== null ? Number(v) : null);
  }
  for (const sv of todos(hoja, "sheetView")) sv.setAttribute("tabSelected", "1");

  const salida = new JSZip();
  salida.file("xl/worksheets/sheet1.xml", escribirXml(hoja));
  // Relaciones de la hoja (dibujos con el texto vertical, ajustes de impresora)
  const rutaRelsHoja = `xl/worksheets/_rels/${nombreArchivo}.rels`;
  const partesExtra: string[] = [];
  if (zip.file(rutaRelsHoja)) {
    const relsHoja = await leer(rutaRelsHoja);
    salida.file("xl/worksheets/_rels/sheet1.xml.rels", relsHoja);
    for (const r of Array.from(leerXml(relsHoja).getElementsByTagName("Relationship"))) {
      if (r.getAttribute("TargetMode") === "External") continue;
      const destino = `xl/${r.getAttribute("Target")!.replace(/^\.\.\//, "")}`;
      const f = zip.file(destino);
      if (!f) continue;
      salida.file(destino, await f.async("uint8array"));
      partesExtra.push(destino);
      const relsDestino = destino.replace(/([^/]+)$/, "_rels/$1.rels");
      if (zip.file(relsDestino)) salida.file(relsDestino, await zip.file(relsDestino)!.async("uint8array"));
    }
  }
  salida.file("xl/styles.xml", await leer("xl/styles.xml"));
  const tema = Object.keys(zip.files).find((f) => /^xl\/theme\/theme\d+\.xml$/.test(f));
  if (tema) salida.file("xl/theme/theme1.xml", await leer(tema));

  // Libro con una sola hoja y su área de impresión
  let xmlLibro = await leer("xl/workbook.xml");
  const areaImpresion = Array.from(libro.getElementsByTagNameNS(NS, "definedName"))
    .find((d) => d.getAttribute("name") === "_xlnm.Print_Area" && d.getAttribute("localSheetId") === String(indice));
  xmlLibro = xmlLibro
    .replace(/<sheets>[\s\S]*?<\/sheets>/, `<sheets><sheet name="${escapar(nombreHoja)}" sheetId="1" r:id="rId1"/></sheets>`)
    .replace(/<definedNames>[\s\S]*?<\/definedNames>/, areaImpresion
      ? `<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">${escapar(areaImpresion.textContent ?? "")}</definedName></definedNames>`
      : "")
    .replace(/ activeTab="\d+"/, "")
    .replace(/ firstSheet="\d+"/, "");
  salida.file("xl/workbook.xml", xmlLibro);
  salida.file("xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>`
    + (tema ? `<Relationship Id="rId2" Type="${REL}/theme" Target="theme/theme1.xml"/>` : "")
    + `<Relationship Id="rId3" Type="${REL}/styles" Target="styles.xml"/></Relationships>`);

  salida.file("_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>`
    + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>`
    + `<Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  salida.file("docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Plantilla de factura · Carpa Diem CRM</dc:title><dc:creator>Carpa Diem CRM</dc:creator></cp:coreProperties>`);
  salida.file("docProps/app.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>`);

  const binarios = partesExtra.some((p) => p.endsWith(".bin"));
  salida.file("[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + (binarios ? `<Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.printerSettings"/>` : "")
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="${TIPO.libro}"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${TIPO.hoja}"/>`
    + (tema ? `<Override PartName="/xl/theme/theme1.xml" ContentType="${TIPO.tema}"/>` : "")
    + `<Override PartName="/xl/styles.xml" ContentType="${TIPO.estilos}"/>`
    + partesExtra.filter((p) => p.startsWith("xl/drawings/") && p.endsWith(".xml")).map((p) => `<Override PartName="/${p}" ContentType="${TIPO.dibujo}"/>`).join("")
    + `<Override PartName="/docProps/core.xml" ContentType="${TIPO.core}"/><Override PartName="/docProps/app.xml" ContentType="${TIPO.app}"/></Types>`);

  return salida.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// ---------------------------------------------------------------------
// Rellenar una factura
// ---------------------------------------------------------------------

export type DatosFacturaExcel = {
  codigo: string; // "CD 2026/26"
  fecha: string; // "2026-11-02"
  nombre: string;
  domicilio: string | null;
  cpCiudad: string | null;
  nif: string | null;
  concepto: string;
  importe: number; // base sin IVA
  ivaPct: number;
  suplidos: number;
};

const redondear = (n: number) => Math.round(n * 100) / 100;

// La fecha y los importes se escriben ya en formato español ("27/10/2026", "1.036,40"):
// el conversor a PDF de Microsoft usa el formato inglés si se dejan como números.
export const fechaFactura = (fecha: string) => fecha.split("-").reverse().join("/");
export const importeFactura = (n: number) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });

// Celdas de la hoja "Emitir" (mismas posiciones que en el Excel contable)
export function celdasFactura(d: DatosFacturaExcel): Record<string, string | null> {
  const iva = redondear(d.importe * d.ivaPct / 100);
  const honorarios = redondear(d.importe + d.suplidos);
  const ivaTexto = `${d.ivaPct.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% de IVA`;
  return {
    B12: fechaFactura(d.fecha),
    C12: `Factura: ${d.codigo}`,
    D12: d.codigo,
    B15: d.nombre,
    B16: d.domicilio,
    B17: d.cpCiudad,
    B18: d.nif,
    B23: d.concepto,
    C23: importeFactura(d.importe),
    B24: d.suplidos > 0 ? "Gastos suplidos" : null,
    C24: d.suplidos > 0 ? importeFactura(d.suplidos) : null,
    C28: importeFactura(honorarios),
    C29: importeFactura(d.importe),
    B30: ivaTexto,
    C30: importeFactura(iva),
    C31: importeFactura(redondear(honorarios + iva)),
    C32: importeFactura(redondear(honorarios + iva)),
    // Ayudas del Excel que no salen en la factura
    D11: null, F7: null, F8: null,
  };
}

// Las celdas de importes de la plantilla ya están alineadas a la derecha: basta con escribir el texto
export async function rellenarFactura(plantilla: Uint8Array | ArrayBuffer, datos: DatosFacturaExcel): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(plantilla);
  const ruta = "xl/worksheets/sheet1.xml";
  const hoja = leerXml(await zip.file(ruta)!.async("string"));
  for (const [ref, valor] of Object.entries(celdasFactura(datos))) ponerValor(hoja, celda(hoja, ref), valor);
  zip.file(ruta, escribirXml(hoja));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// Para los tests: valor de una celda de la plantilla rellena
export async function leerCelda(xlsx: Uint8Array | ArrayBuffer, ref: string): Promise<string | null> {
  const zip = await JSZip.loadAsync(xlsx);
  const hoja = leerXml(await zip.file("xl/worksheets/sheet1.xml")!.async("string"));
  const c = todos(hoja, "c").find((x) => x.getAttribute("r") === ref);
  if (!c) return null;
  return c.getAttribute("t") === "inlineStr"
    ? Array.from(c.getElementsByTagNameNS(NS, "t")).map((t) => t.textContent).join("")
    : hijos(c, "v")[0]?.textContent ?? null;
}
