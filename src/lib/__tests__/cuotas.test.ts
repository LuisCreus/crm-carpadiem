import { describe, expect, it } from "vitest";
import { cuotaDelMes, mensualidadesPendientes, mesesAFacturar } from "../cuotas";

describe("cuotas de una carpa de temporada", () => {
  const cuotas = [{ desde: "2026-06", importe: 670 }, { desde: "2026-09", importe: 480 }];

  it("la cuota cambia a partir del mes indicado", () => {
    expect(cuotaDelMes(cuotas, "2026-06")).toBe(670);
    expect(cuotaDelMes(cuotas, "2026-08")).toBe(670);
    expect(cuotaDelMes(cuotas, "2026-09")).toBe(480);
    expect(cuotaDelMes(cuotas, "2026-05", 500)).toBe(500);
  });

  it("toca facturar los meses terminados y el actual desde 5 días antes de fin de mes", () => {
    expect(mesesAFacturar("2026-06-01", "2026-11-30", "2026-11-03")).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(mesesAFacturar("2026-06-01", "2026-11-30", "2026-11-25")).toContain("2026-11");
    // Fuera de temporada no se factura
    expect(mesesAFacturar("2026-06-01", "2026-11-30", "2027-01-15")).toHaveLength(6);
  });

  it("Peñalagos hoy: 5 mensualidades emitidas (junio-octubre); noviembre avisa a final de mes", () => {
    expect(mensualidadesPendientes("2026-06-01", "2026-11-30", "2026-11-03", 5)).toEqual([]);
    expect(mensualidadesPendientes("2026-06-01", "2026-11-30", "2026-11-26", 5)).toEqual(["2026-11"]);
    expect(mensualidadesPendientes("2026-06-01", "2026-11-30", "2026-12-02", 5)).toEqual(["2026-11"]);
  });
});
