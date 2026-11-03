import { describe, expect, it } from "vitest";
import { ibanValido, leerDatosFactura } from "../leer-factura";

const MONTADOR = `
David Mendoza Ruiz
NIF: 12345678Z
C/ Mayor 3, 28001 Madrid
FACTURA Nº 2026-021
Fecha: 05/09/2026
Cliente: CARPADIEM IBERICA, S.L. CIF B26815829
Concepto: Montaje y desmontaje carpas Elena Guinea
Base imponible 1.000,00 €
IVA 21% 210,00 €
Retención IRPF 15% -150,00 €
TOTAL FACTURA 1.060,00 €
Forma de pago: transferencia a ES91 2100 0418 4502 0005 1332
`;

const FURGONETA = `
ALQUILERES RÁPIDOS SL   B87654321
Factura: FR-4471   Fecha de factura 13-06-2026
Furgoneta L2H2 2 días
Subtotal 148,76
IVA (21 %) 31,24
Total 180,00 €
`;

describe("leer una factura en PDF", () => {
  it("factura de un autónomo con retención de IRPF", () => {
    expect(leerDatosFactura(MONTADOR)).toEqual({
      nif: "12345678Z", iban: "ES91 2100 0418 4502 0005 1332", numero: "2026-021", fecha: "2026-09-05",
      base: 1000, ivaPct: 21, irpfPct: 15, total: 1060,
    });
  });

  it("factura de empresa sin IBAN; no confunde nuestro CIF con el del proveedor", () => {
    const d = leerDatosFactura(FURGONETA);
    expect(d).toMatchObject({ nif: "B87654321", iban: null, numero: "FR-4471", fecha: "2026-06-13", base: 148.76, ivaPct: 21, total: 180 });
  });

  it("no toma nuestro propio IBAN", () => {
    expect(leerDatosFactura("Pagar en ES33 0049 5119 1721 1716 1045").iban).toBeNull();
  });

  it("comprueba que el IBAN es válido", () => {
    expect(ibanValido("ES91 2100 0418 4502 0005 1332")).toBe(true);
    expect(ibanValido("ES91 2100 0418 4502 0005 1333")).toBe(false);
  });

  it("casos reales: NIF con puntos, IBAN con espacios irregulares y base junto a un %", () => {
    const d = leerDatosFactura("FACTURA Nº: 261004 | FECHA FACTURA: 16/10/2026 | TOTAL IMPORTES BRUTOS 450,00 € | BASE IMPONIBLE I.V.A. 21% 450,00 € | I.V.A. (21 %) 94,50 € | RETENCIÓN I.R.P.F. (15%) 67,50 €- | TOTAL 477,00 € | N.I.F.: 12.345.678-Z | IBAN Nº: ES91 2100 04 18450200051332");
    expect(d).toEqual({ nif: "12345678Z", iban: "ES91 2100 0418 4502 0005 1332", numero: "261004", fecha: "2026-10-16", base: 450, ivaPct: 21, irpfPct: 15, total: 477 });
  });

  it("casos reales: % deducidos, número con letras y fecha con el mes en letra", () => {
    expect(leerDatosFactura("Factura nº: 20082173-75 | Fecha: 9/10/2026 | Subtotal 360€ | 21% 75,60€ | -15% 54€ | TOTAL: 381,60€"))
      .toMatchObject({ numero: "20082173-75", base: 360, ivaPct: 21, irpfPct: 15, total: 381.6 });
    expect(leerDatosFactura("5/10/26 Factura: GS 2026/217 | Total Honorarios 350,00 | Total Sujeto al IVA 350,00 | 21,00% de IVA 73,50 | Subtotal 423,50 | TOTAL FACTURA EN EUROS 423,50"))
      .toMatchObject({ numero: "GS 2026/217", base: 350, ivaPct: 21, total: 423.5 });
    expect(leerDatosFactura("Num.Factura: 7 | Fecha: 27-oct.-2026 | Base imponible 1.100,00 | IVA 21% 231,00 | Importe a pagar 1.331,00"))
      .toMatchObject({ numero: "7", fecha: "2026-10-27", base: 1100, ivaPct: 21, total: 1331 });
  });
});
