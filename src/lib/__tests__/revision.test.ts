import { describe, expect, it } from "vitest";
import { leerEuros } from "../formato";
import { totalFactura } from "../facturacion";
import { diaDe } from "../operativa";

describe("revisión: importes, céntimos y fechas", () => {
  it("lee importes en texto con signo y miles", () => {
    expect(leerEuros("-1.500")).toBe(-1500);
    expect(leerEuros("+250,00")).toBe(250);
    expect(leerEuros("-1.234.567")).toBe(-1234567);
    expect(leerEuros("3.973,80 €")).toBe(3973.8);
  });

  it("el IVA redondea bien los medios céntimos", () => {
    expect(totalFactura({ importe: 21.5, iva_pct: 21, suplidos: 0 }).iva).toBe(4.52);
    expect(totalFactura({ importe: 1100, iva_pct: 21, suplidos: 0 }).total).toBe(1331);
  });

  it("un instante cerca de medianoche cuenta en el día de Madrid", () => {
    expect(diaDe("2026-11-06T23:30:00Z")).toBe("2026-11-07");
    expect(diaDe("2026-11-07")).toBe("2026-11-07");
  });
});
