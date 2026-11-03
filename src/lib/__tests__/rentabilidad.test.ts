import { describe, expect, it } from "vitest";
import { rangoTrimestre, rentabilidadEvento, resumenMensual, trimestreDe, type EventoRentabilidad } from "../rentabilidad";

const ev = (id: string, extra: Partial<EventoRentabilidad> = {}): EventoRentabilidad => ({
  id, cliente: id, estado: "activo", fecha_precision: "dia", fecha_inicio: "2026-06-20", importe: 10000,
  importe_retenido: null, es_larga_duracion: false, comision_pct: null, ...extra,
});
const g = (evento_id: string | null, base: number, fecha = "2026-06-21", categoria: string | null = "montadores") => ({ evento_id, base, fecha, categoria });

describe("rentabilidad de un evento", () => {
  it("importe aceptado menos gastos, sin IVA", () => {
    expect(rentabilidadEvento(ev("a"), [g("a", 1640), g("a", 1620), g("b", 999)], [])).toEqual({
      ingresos: 10000, gastos: 3260, comisionPrevista: 0, margen: 6740, margenPct: 0.674,
    });
  });

  it("comisión del intermediario prevista hasta que llega su factura", () => {
    const e = ev("a", { comision_pct: 10 });
    expect(rentabilidadEvento(e, [], []).comisionPrevista).toBe(1000);
    expect(rentabilidadEvento(e, [g("a", 900, "2026-06-25", "comisiones")], [])).toMatchObject({ comisionPrevista: 0, gastos: 900, margen: 9100 });
  });

  it("cancelado quedándonos la reserva: el ingreso es lo retenido", () => {
    expect(rentabilidadEvento(ev("a", { estado: "cancelado_reserva_retenida", importe_retenido: 1536 }), [], []).ingresos).toBe(1536);
  });
});

describe("resumen mes a mes", () => {
  it("cada evento en su mes; Peñalagos por mensualidades; los cancelados no cuentan", () => {
    const eventos = [
      ev("boda"),
      ev("caido", { estado: "cancelado" }),
      ev("penalagos", { es_larga_duracion: true, fecha_precision: "por_definir", fecha_inicio: null, importe: null }),
      ev("sinfecha", { fecha_precision: "por_definir", fecha_inicio: null, importe: 500 }),
    ];
    const facturas = [
      { evento_id: "penalagos", importe: 670, estado: "pagada", fecha_emision: "2026-07-10" },
      { evento_id: "penalagos", importe: 670, estado: "emitida", fecha_emision: "2026-10-27" },
      { evento_id: "penalagos", importe: 670, estado: "prevista", fecha_emision: null },
    ];
    const meses = resumenMensual(2026, eventos, [g("boda", 3260)], facturas);
    expect(meses.find((m) => m.clave === "2026-06")).toEqual({ clave: "2026-06", ingresos: 10000, gastos: 3260, margen: 6740, eventos: 1 });
    expect(meses.find((m) => m.clave === "2026-07")?.ingresos).toBe(670);
    expect(meses.find((m) => m.clave === "2026-10")?.ingresos).toBe(670);
    expect(meses.at(-1)).toMatchObject({ clave: "sin-fecha", ingresos: 500 });
    expect(meses).toHaveLength(13);
  });
});

describe("trimestres", () => {
  it("trimestre de una fecha y sus días", () => {
    expect(trimestreDe("2026-11-03")).toBe(4);
    expect(trimestreDe("2026-03-31")).toBe(1);
    expect(rangoTrimestre(2026, 4)).toEqual({ desde: "2026-10-01", hasta: "2026-12-31" });
    expect(rangoTrimestre(2028, 1)).toEqual({ desde: "2028-01-01", hasta: "2028-03-31" });
  });
});
