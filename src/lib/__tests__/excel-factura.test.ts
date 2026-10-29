import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { celdasFactura, crearPlantillaFactura, leerCelda, rellenarFactura } from "../excel/factura";
import { nombreArchivoFactura } from "../facturacion";

// Un "Excel contable" pequeño: una hoja con datos privados y la hoja "Emitir"
async function excelContable() {
  const libro = new ExcelJS.Workbook();
  const general = libro.addWorksheet("Facturas");
  general.getCell("H4").value = "CD 2026/25";
  general.getCell("J4").value = "Cliente secreto SL";
  general.getCell("K4").value = "Domicilio privado 7";
  const emitir = libro.addWorksheet("Emitir");
  emitir.getCell("B2").value = "CARPADIEM IBERICA, S.L.";
  emitir.getCell("B2").font = { bold: true, size: 16, color: { argb: "FFF14F49" } };
  emitir.getCell("D12").value = "CD 2026/25";
  emitir.getCell("C12").value = { formula: "\"Factura: \"&D12", result: "Factura: CD 2026/25" };
  emitir.getCell("C23").value = { formula: "Facturas!J4", result: "Cliente secreto SL" };
  emitir.getCell("C28").value = { formula: "C23", result: 670 };
  emitir.getCell("B38").value = "IBAN: ES33 0049 5119 1721 1716 1045";
  libro.definedNames.add("Emitir!$A$1:$C$38", "_xlnm.Print_Area");
  return new Uint8Array(await libro.xlsx.writeBuffer());
}

const DATOS = {
  codigo: "CD 2026/26", fecha: "2026-11-02", nombre: "Carlota Durán", domicilio: "C/ Mayor 1", cpCiudad: "28001 Madrid",
  nif: "12345678Z", concepto: "Honorarios correspondientes a \"primer pago y reserva de material\"", importe: 3973.8, ivaPct: 21, suplidos: 0,
};

describe("plantilla de factura (hoja Emitir)", () => {
  it("saca solo la hoja Emitir, sin fórmulas ni datos de otras hojas", async () => {
    const plantilla = await crearPlantillaFactura(await excelContable());
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(plantilla.buffer as ArrayBuffer);
    expect(libro.worksheets.map((w) => w.name)).toEqual(["Emitir"]);
    expect(await leerCelda(plantilla, "B2")).toBe("CARPADIEM IBERICA, S.L.");
    expect(await leerCelda(plantilla, "C12")).toBe("Factura: CD 2026/25");
    const zip = await JSZip.loadAsync(plantilla);
    const todo = (await Promise.all(Object.values(zip.files).filter((f) => !f.dir).map((f) => f.async("string")))).join("");
    expect(todo).not.toContain("<f>");
    expect(Object.keys(zip.files)).not.toContain("xl/sharedStrings.xml");
    expect(todo).not.toContain("Domicilio privado 7"); // la hoja "Facturas" no viaja en la plantilla
    expect(libro.worksheets[0].getCell("B2").font?.bold).toBe(true);
  });

  it("rellena fecha, cliente e importes en formato español", async () => {
    const xlsx = await rellenarFactura(await crearPlantillaFactura(await excelContable()), DATOS);
    expect(await leerCelda(xlsx, "B12")).toBe("02/11/2026");
    expect(await leerCelda(xlsx, "C12")).toBe("Factura: CD 2026/26");
    expect(await leerCelda(xlsx, "B15")).toBe("Carlota Durán");
    expect(await leerCelda(xlsx, "C23")).toBe("3.973,80");
    expect(await leerCelda(xlsx, "C30")).toBe("834,50");
    expect(await leerCelda(xlsx, "C32")).toBe("4.808,30");
    expect(await leerCelda(xlsx, "B38")).toBe("IBAN: ES33 0049 5119 1721 1716 1045");
  });

  it("los suplidos van aparte y no llevan IVA", () => {
    const c = celdasFactura({ ...DATOS, importe: 1000, suplidos: 50 });
    expect([c.B24, c.C24, c.C28, c.C29, c.C30, c.C32]).toEqual(["Gastos suplidos", "50,00", "1.050,00", "1.000,00", "210,00", "1.260,00"]);
  });

  it("nombre del archivo como los de PENDIENTE SARA", () => {
    expect(nombreArchivoFactura(26, "Carlota Durán")).toBe("FACTURA CD 26 CARLOTA DURÁN.pdf");
  });
});
