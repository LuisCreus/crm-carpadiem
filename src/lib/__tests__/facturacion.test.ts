import { describe, expect, it } from "vitest";
import { conceptoMensualidad, resumenFacturacion, totalFactura } from "../facturacion";
import type { Factura } from "../datos/tipos";

const f = (tipo: Factura["tipo"], estado: Factura["estado"], importe: number) => ({ tipo, estado, importe, iva_pct: 21, suplidos: 0 }) as Factura;

describe("facturación", () => {
  it("total con IVA y suplidos, como la hoja Emitir", () => {
    expect(totalFactura({ importe: 670, iva_pct: 21, suplidos: 0 })).toEqual({ base: 670, iva: 140.7, total: 810.7 });
    expect(totalFactura({ importe: 1000, iva_pct: 21, suplidos: 50 }).total).toBe(1260);
  });

  it("resumen del evento: facturado, por facturar y por cobrar (sin IVA)", () => {
    const lista = [f("reserva", "pagada", 2165), f("resto", "emitida", 1299), f("resto", "prevista", 866)];
    expect(resumenFacturacion(4330, lista, 3464)).toEqual({ total: 4330, facturado: 3464, porFacturar: 866, cobrado: 3464, porCobrar: 866 });
  });

  it("concepto de la mensualidad", () => {
    expect(conceptoMensualidad("2026-11-03")).toBe("Honorarios correspondientes a servicio de CARPAS en NOVIEMBRE de 2026");
  });
});
