import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { insertarControles, leerControles, leerImporte, numeroEspanol, rellenarControles } from "../controles";

// Un .docx mínimo parecido a la plantilla de Carpa Diem: los textos vienen
// partidos en varios "runs", como hace Word.
const r = (t: string, negrita = false) =>
  `<w:r>${negrita ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${t}</w:t></w:r>`;
const p = (...runs: string[]) => `<w:p>${runs.join("")}</w:p>`;
const celda = (...parrafos: string[]) => `<w:tc>${parrafos.join("")}</w:tc>`;

const DOCUMENTO = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${p(r("Cliente:", true), r("   "), r("Vic"), r("toria"))}
${p(r("Fecha:", true), r("   24/10/2026"))}
<w:tbl><w:tr>${celda(p(r("Ubicación:", true)))}${celda(p(r("Plasencia")))}</w:tr></w:tbl>
${p(r("Nº Presupuesto: XX", true))}
<w:tbl><w:tr>${celda(p(r("TOTAL (SIN IVA)")))}${celda(p(r("1"), r(" 3.246"), r("   €")))}</w:tr></w:tbl>
${p(r("●   El pago del "), r("50% en depósito confirmará la reserva. El resto a pagar a la finalización del montaje."))}
</w:body></w:document>`;

async function docxDePrueba() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("word/document.xml", DOCUMENTO);
  return zip.generateAsync({ type: "uint8array" });
}

async function xmlDe(docx: Uint8Array) {
  return (await JSZip.loadAsync(docx)).file("word/document.xml")!.async("string");
}

describe("controles de contenido en el Word", () => {
  it("prepara la plantilla con los 5 controles sin cambiar el texto", async () => {
    const original = await docxDePrueba();
    const { docx, etiquetas } = await insertarControles(original);
    expect(etiquetas.sort()).toEqual(["cliente", "fecha", "numero", "reserva", "ubicacion"]);
    expect(await leerControles(docx)).toEqual({
      cliente: "Victoria", fecha: "24/10/2026", ubicacion: "Plasencia", numero: "XX", reserva: "50",
    });
    // Los rótulos siguen fuera de los controles y en negrita
    const xml = await xmlDe(docx);
    expect(xml).toContain("Cliente:");
    expect(xml).toContain("<w:b/>");
  });

  it("insertar dos veces no duplica los controles", async () => {
    const una = (await insertarControles(await docxDePrueba())).docx;
    const dos = (await insertarControles(una)).docx;
    expect((await xmlDe(dos)).match(/<w:sdt>/g)).toHaveLength(5);
  });

  it("rellena los controles con los datos del presupuesto", async () => {
    const plantilla = (await insertarControles(await docxDePrueba())).docx;
    const { docx } = await rellenarControles(plantilla, {
      cliente: "CARLOTA DURÁN", fecha: "08/05/2027", ubicacion: "Finca Los Arcos, Madrid", numero: "CD 078", reserva: "30",
    });
    expect(await leerControles(docx)).toEqual({
      cliente: "CARLOTA DURÁN", fecha: "08/05/2027", ubicacion: "Finca Los Arcos, Madrid", numero: "CD 078", reserva: "30",
    });
    expect((await leerImporte(docx)).reservaPct).toBe(30);
  });

  it("una copia ya rellenada se puede volver a rellenar (Duplicar)", async () => {
    const plantilla = (await insertarControles(await docxDePrueba())).docx;
    const primero = (await rellenarControles(plantilla, { cliente: "CARLOTA DURÁN", numero: "CD 078", reserva: "30" })).docx;
    const copia = (await rellenarControles(primero, { cliente: "ELENA GUINEA", numero: "CD 079", reserva: "50" })).docx;
    const valores = await leerControles(copia);
    expect(valores).toMatchObject({ cliente: "ELENA GUINEA", numero: "CD 079", reserva: "50", fecha: "24/10/2026" });
    expect((await xmlDe(copia)).match(/<w:sdt>/g)).toHaveLength(5);
    expect(await xmlDe(copia)).not.toContain("CARLOTA");
  });

  it("los caracteres especiales se escriben bien", async () => {
    const plantilla = (await insertarControles(await docxDePrueba())).docx;
    const { docx } = await rellenarControles(plantilla, { cliente: "Rocío & Íñigo <Boda>" });
    expect((await leerControles(docx)).cliente).toBe("Rocío & Íñigo <Boda>");
  });

  it("lee el TOTAL (SIN IVA) aunque Word lo parta en trozos", async () => {
    const { total, reservaPct } = await leerImporte(await docxDePrueba());
    expect(total).toBe(13246);
    expect(reservaPct).toBe(50);
  });

  it("entiende importes en formato español", () => {
    expect(numeroEspanol("1 3.246   €")).toBe(13246);
    expect(numeroEspanol("3.973,80 €")).toBe(3973.8);
    expect(numeroEspanol("sin cifra")).toBeNull();
  });
});
