import { describe, expect, it } from "vitest";
import { gastosEvento, totalRecibida } from "../gastos";

describe("gastos", () => {
  it("total a pagar con IVA y retención de IRPF", () => {
    expect(totalRecibida(1000, 21, 15)).toBe(1060);
    expect(totalRecibida(114.21, 21, 0)).toBe(138.19);
  });

  it("gastos de un evento, sin IVA", () => {
    expect(gastosEvento([{ base: 250 }, { base: 66.63 }, { base: 45.61 }])).toBe(362.24);
  });
});
