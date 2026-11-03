import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import { ficheroSepa, problemaTransferencia, textoSepa } from "../sepa";

const T = [
  { id: "1", beneficiario: "David Mendoza Ruiz", iban: "ES91 2100 0418 4502 0005 1332", importe: 1060, concepto: "Pago factura 21" },
  { id: "2", beneficiario: "Alquileres Peña & Cía SL", iban: "ES9121000418450200051332", importe: 180.5, concepto: "Pago factura FR-4471 · furgoneta" },
];

describe("fichero SEPA para el banco", () => {
  it("una transferencia por factura, con el total y el concepto que verá el proveedor", () => {
    const xml = ficheroSepa({ transferencias: T, fechaEjecucion: "2026-11-04", creado: new Date("2026-11-03T10:00:00Z") });
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const texto = (etiqueta: string) => Array.from(doc.getElementsByTagName(etiqueta)).map((e) => e.textContent);
    expect(texto("NbOfTxs")).toEqual(["2", "2"]);
    expect(texto("CtrlSum")).toEqual(["1240.50", "1240.50"]);
    expect(texto("InstdAmt")).toEqual(["1060.00", "180.50"]);
    expect(texto("IBAN")).toEqual(["ES3300495119172117161045", "ES9121000418450200051332", "ES9121000418450200051332"]);
    expect(texto("Ustrd")).toEqual(["Pago factura 21", "Pago factura FR-4471 furgoneta"]);
    expect(texto("Nm")).toContain("Alquileres Pena Cia SL");
    expect(texto("ReqdExctnDt")).toEqual(["2026-11-04"]);
    expect(texto("Id")).toContain("B26815829000");
  });

  it("no deja generar el fichero con IBAN incorrectos", () => {
    expect(problemaTransferencia({ beneficiario: "David", iban: "ES 12313 123123 123123", importe: 100 })).toBe("El IBAN no es correcto");
    expect(problemaTransferencia({ beneficiario: "David", iban: "", importe: 100 })).toBe("Falta el IBAN");
    expect(() => ficheroSepa({ transferencias: [{ ...T[0], iban: "ES00" }], fechaEjecucion: "2026-11-04", creado: new Date() })).toThrow();
  });

  it("texto que aceptan los bancos: sin tildes ni símbolos raros", () => {
    expect(textoSepa("Peñalagos – mensualidad € octubre", 140)).toBe("Penalagos mensualidad octubre");
  });
});
