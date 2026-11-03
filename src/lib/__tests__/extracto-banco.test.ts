import { describe, expect, it } from "vitest";
import { esNorma43, huella, leerCsv, leerHtml, leerNorma43, leerTabla } from "../extracto-banco";

// Línea Norma 43 de 80 caracteres
const fija = (s: string) => s.padEnd(80, " ").slice(0, 80);
const N43 = [
  fija("11" + "0049" + "5119" + "1721171610" + "261001" + "261031" + "2" + "00000001000000" + "978" + "3" + "CARPADIEM IBERICA SL"),
  fija("2200005119261027261027" + "02" + "000" + "2" + "00000000081070" + "0000000000" + "000000000000" + "0000000000000000"),
  fija("2301" + "TRANSFERENCIA DE ENTIDAD URBANISTICA".padEnd(38) + "PENALAGOS FACTURA CD 2026/25"),
  fija("2200005119261028261028" + "12" + "000" + "1" + "00000000004900" + "0000000000" + "000000000000" + "0000000000000000"),
  fija("2301RECIBO MICROSOFT IRELAND OPERATIONS"),
  fija("33004951191721171610450000200000000004900000010000000081070200000000000017617" + "0"),
  fija("88999999999999999999000006"),
].join("\r\n");

describe("extracto del banco", () => {
  it("Norma 43: cobros en positivo, pagos en negativo, concepto completo y saldo", () => {
    expect(esNorma43(N43)).toBe(true);
    expect(leerNorma43(N43)).toEqual([
      { fecha: "2026-10-27", fechaValor: "2026-10-27", concepto: "TRANSFERENCIA DE ENTIDAD URBANISTICA PENALAGOS FACTURA CD 2026/25", importe: 810.7, saldo: 10810.7, referencia: null },
      { fecha: "2026-10-28", fechaValor: "2026-10-28", concepto: "RECIBO MICROSOFT IRELAND OPERATIONS", importe: -49, saldo: 10761.7, referencia: null },
    ]);
  });

  it("Excel: busca la fila de títulos aunque haya filas antes", () => {
    const filas = [
      ["Cuenta: ES33 0049 …", null],
      [],
      ["Fecha operación", "Fecha valor", "Concepto", "Importe", "Saldo"],
      ["27/10/2026", "27/10/2026", "Transferencia Peñalagos CD 2026/25", "810,70", "10.810,70"],
      [new Date("2026-10-28T00:00:00Z"), null, "Recibo Microsoft", -49, 10761.7],
      ["", "", "", "", ""],
    ];
    expect(leerTabla(filas).map((m) => [m.fecha, m.concepto, m.importe, m.saldo])).toEqual([
      ["2026-10-27", "Transferencia Peñalagos CD 2026/25", 810.7, 10810.7],
      ["2026-10-28", "Recibo Microsoft", -49, 10761.7],
    ]);
  });

  it("CSV con columnas de cargo y abono", () => {
    const csv = "Fecha;Concepto;Cargo;Abono;Saldo\n01/11/2026;Gasolina Repsol;45,61;;1000\n02/11/2026;Cobro Clara;;1.391,50;2391,5";
    expect(leerCsv(csv).map((m) => m.importe)).toEqual([-45.61, 1391.5]);
  });

  it("tabla HTML (los .xls que en realidad son una página)", () => {
    const html = "<table><tr><th>Fecha</th><th>Concepto</th><th>Importe</th></tr><tr><td>03/11/2026</td><td>Recibo&nbsp;Microsoft</td><td>-12,96</td></tr></table>";
    expect(leerHtml(html)).toMatchObject([{ fecha: "2026-11-03", concepto: "Recibo Microsoft", importe: -12.96 }]);
  });

  it("la huella no cambia al volver a subir el mismo movimiento", () => {
    const [a] = leerNorma43(N43);
    expect(huella(a)).toBe(huella({ ...a }));
  });
});
