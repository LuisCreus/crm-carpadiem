import { describe, expect, it } from "vitest";
import { codigoPresupuesto, formatoEuros, formatoFecha, formatoPorcentaje } from "../formato";

describe("formato", () => {
  it("importes con punto de miles y € al final", () => {
    expect(formatoEuros(13246)).toBe("13.246 €");
    expect(formatoEuros(3973.8)).toBe("3.973,80 €");
    expect(formatoEuros(950)).toBe("950 €");
    expect(formatoEuros(null)).toBe("—");
  });

  it("fechas dd/mm/aaaa", () => {
    expect(formatoFecha("2027-05-08")).toBe("08/05/2027");
    expect(formatoFecha(null)).toBe("—");
  });

  it("porcentajes", () => {
    expect(formatoPorcentaje(30)).toBe("30 %");
  });

  it("código de presupuesto con 3 dígitos", () => {
    expect(codigoPresupuesto(78)).toBe("CD 078");
    expect(codigoPresupuesto(13)).toBe("CD 013");
    expect(codigoPresupuesto(1234)).toBe("CD 1234");
  });
});
