import { describe, expect, it } from "vitest";
import { codigoPresupuesto, formatoEuros, formatoFecha, formatoPorcentaje, hoyMadrid, leerEuros } from "../formato";

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

describe("leerEuros", () => {
  it("entiende los importes escritos a la española", () => {
    expect(leerEuros("1.500")).toBe(1500);
    expect(leerEuros("3.973,80")).toBe(3973.8);
    expect(leerEuros("13246 €")).toBe(13246);
    expect(leerEuros("250,5")).toBe(250.5);
    expect(leerEuros("12.5")).toBe(12.5);
    expect(leerEuros("abc")).toBeNull();
  });
});

describe("hoyMadrid", () => {
  it("usa la hora de Madrid: a las 00:30 de Madrid ya es el día siguiente", () => {
    expect(hoyMadrid(new Date("2026-10-28T23:30:00Z"))).toBe("2026-10-29"); // 00:30 en Madrid (invierno)
    expect(hoyMadrid(new Date("2026-07-14T22:30:00Z"))).toBe("2026-07-15"); // 00:30 en Madrid (verano)
  });
});
