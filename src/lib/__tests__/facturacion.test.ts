import { describe, expect, it } from "vitest";
import { conceptoAlEmitir, conceptoMensualidad, resumenFacturacion, textoCorreoFactura, totalFactura } from "../facturacion";
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

  it("concepto propuesto al emitir: reserva, resto con el mes de emisión y el escrito a mano", () => {
    const hoy = "2026-11-03";
    expect(conceptoAlEmitir({ tipo: "reserva", concepto: "x", automatica: true }, hoy))
      .toBe('Honorarios correspondientes a "primer pago y reserva de material"');
    expect(conceptoAlEmitir({ tipo: "resto", concepto: "… en JULIO de 2027", automatica: true }, hoy))
      .toBe("Honorarios correspondientes a servicio de CARPAS en NOVIEMBRE de 2026");
    expect(conceptoAlEmitir({ tipo: "otra", concepto: "Alquiler de tarima", automatica: false }, hoy)).toBe("Alquiler de tarima");
  });

  it("texto del correo con el total con IVA", () => {
    const c = textoCorreoFactura({ codigo: "CD 2026/26", tipo: "reserva", importe: 3000, iva_pct: 21, suplidos: 0 }, null);
    expect(c.asunto).toBe("Factura CD 2026/26 · Carpa Diem");
    expect(c.texto).toContain("factura CD 2026/26 correspondiente a la reserva por importe de 3.630,00 € (IVA incluido)");
  });
});
