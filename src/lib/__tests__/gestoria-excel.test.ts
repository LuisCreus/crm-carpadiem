import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { carpetaTrimestre, excelTrimestre, nombreExcelTrimestre } from "../gestoria-excel";

describe("Excel del trimestre para la gestoría", () => {
  it("libro de emitidas y recibidas con sus totales", async () => {
    const xlsx = await excelTrimestre(2026, 4,
      [{ codigo: "CD 2026/25", fecha: "2026-10-27", nombre: "Entidad Urbanística Peñalagos", nif: "G19023696", concepto: "Mensualidad", base: 670, ivaPct: 21, iva: 140.7, suplidos: 0, total: 810.7, estado: "Enviada" },
       { codigo: "CD 2026/26", fecha: "2026-11-02", nombre: "Carlota Durán", nif: "12345678Z", concepto: "Reserva", base: 1000, ivaPct: 21, iva: 210, suplidos: 0, total: 1210, estado: "Pagada" }],
      [{ fecha: "2026-11-01", numero: "21", proveedor: "David Mendoza", nif: "12345678Z", concepto: "Pago factura 21", base: 1000, ivaPct: 21, iva: 210, irpfPct: 15, irpf: 150, total: 1060, estado: "Por pagar" }]);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(xlsx.buffer as ArrayBuffer);
    expect(libro.worksheets.map((w) => w.name)).toEqual(["Emitidas", "Recibidas"]);
    const e = libro.getWorksheet("Emitidas")!;
    expect(e.rowCount).toBe(4);
    expect(e.getRow(4).getCell(1).value).toBe("TOTAL");
    expect(e.getRow(4).getCell(10).value).toBeCloseTo(2020.7);
    expect(libro.getWorksheet("Recibidas")!.getRow(3).getCell(10).value).toBe(150);
  });

  it("nombres y carpeta del trimestre", () => {
    expect(nombreExcelTrimestre(2026, 4)).toBe("RESUMEN FACTURAS CARPA DIEM 2026 4T.xlsx");
    expect(carpetaTrimestre(2026, 4)).toBe("CARPA DIEM/03. FINANCIERO/01. FACTURAS/2026/4 TRIMESTRE");
  });
});
