import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { copiasQueSobran, generarExcelCopia, nombreCopia } from "../copias";

describe("copia de seguridad", () => {
  it("genera las 5 hojas con sus datos y formatos", async () => {
    const xlsx = await generarExcelCopia({
      presupuestos: [{ codigo: "CD 078", anio: 2026, cliente: "Carlota Durán", estado: "Pendiente", fecha_evento: "2027-05-08", importe: 13246 }],
      eventos: [{ codigo: "CD 063", cliente: "Elena Guinea", fecha_inicio: "2026-09-05", importe: 13070, cobrado: 13070, es_larga_duracion: false }],
      leads: [{ cliente_nombre: "Familia Ortega", estado: "Interesado" }],
      cobros: [{ codigo: "CD 063", fecha: "2026-09-03", importe: 11870 }],
      material: [{ cliente: "Elena Guinea", material: "Picas 1 m", sentido: "sale", cantidad: 32 }],
    }, new Date("2026-11-02T06:00:00Z"));

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(xlsx.buffer as ArrayBuffer);
    expect(libro.worksheets.map((w) => w.name)).toEqual(["Presupuestos", "Eventos", "Leads", "Cobros", "Material"]);
    const p = libro.getWorksheet("Presupuestos")!;
    expect(p.getRow(1).getCell(1).value).toBe("Nº");
    expect(p.getRow(2).getCell(1).value).toBe("CD 078");
    expect(p.getRow(2).getCell(6).value).toEqual(new Date(Date.UTC(2027, 4, 8)));
    expect(p.getRow(2).getCell(12).value).toBe(13246);
    expect(libro.getWorksheet("Eventos")!.getRow(2).getCell(15).value).toBe("No");
  });

  it("nombre con la fecha de Madrid", () => {
    expect(nombreCopia(new Date("2026-11-02T06:00:00Z"))).toBe("CRM CARPA DIEM 2026-11-02.xlsx");
    // 23:30 UTC del domingo ya es lunes en Madrid
    expect(nombreCopia(new Date("2026-11-01T23:30:00Z"))).toBe("CRM CARPA DIEM 2026-11-02.xlsx");
  });

  it("conserva las 12 últimas y no toca otros archivos", () => {
    const nombres = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 5 + i * 7));
      return `CRM CARPA DIEM ${d.toISOString().slice(0, 10)}.xlsx`;
    });
    const sobran = copiasQueSobran([...nombres, "LEEME.docx", "CRM CARPA DIEM copia a mano.xlsx"]);
    expect(sobran).toEqual(["CRM CARPA DIEM 2026-01-12.xlsx", "CRM CARPA DIEM 2026-01-05.xlsx"]);
  });
});
