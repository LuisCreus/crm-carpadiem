import { describe, expect, it } from "vitest";
import { calcularPyg, cuotaActivo, tipoImpuesto, type Activo, type EventoPyg, type GastoPyg, type Nombres } from "../pyg";

const nombres: Nombres = {
  tiposEvento: new Map([["boda", "Boda"], ["larga_duracion", "Proyecto de larga duración"]]),
  categorias: new Map([
    ["montadores", { nombre: "Montadores", tipo: "variable" }], ["gestoria", { nombre: "Gestoría", tipo: "fijo" }],
    ["ia", { nombre: "IA", tipo: "fijo" }], ["director", { nombre: "Sueldo del director", tipo: "fijo" }], ["material_carpas", { nombre: "Material de carpas (inversión)", tipo: "fijo" }],
  ]),
};
const evento = (x: Partial<EventoPyg>): EventoPyg => ({
  id: "e", cliente: "C", estado: "activo", fecha_precision: "dia", fecha_inicio: "2026-08-15", importe: 6000,
  importe_retenido: null, es_larga_duracion: false, comision_pct: null, tipo_evento: "boda", ...x,
});
const activo = (x: Partial<Activo>): Activo => ({ id: "a", nombre: "Carpa", coste: 12000, vida_anios: 10, fecha_compra: "2026-05-20", cuota_manual: null, ...x });

describe("P&L", () => {
  it("amortización desde el mes de compra y durante la vida útil", () => {
    const a = activo({});
    expect(cuotaActivo(a, "2026-04")).toBe(0);
    expect(cuotaActivo(a, "2026-05")).toBe(100);
    expect(cuotaActivo(a, "2036-04")).toBe(100);
    expect(cuotaActivo(a, "2036-05")).toBe(0);
    expect(cuotaActivo(activo({ cuota_manual: 80 }), "2027-01")).toBe(80);
  });

  it("IS: 15 % hasta 2027 y 25 % desde 2028", () => {
    expect(tipoImpuesto(2027)).toBe(0.15);
    expect(tipoImpuesto(2028)).toBe(0.25);
  });

  it("todo por fecha de factura: ingresos al emitirse (por tipo de evento), gastos en el mes de su factura, el CAPEX fuera", () => {
    const eventos = [
      evento({ id: "boda", comision_pct: 10, material: "2 carpas beduinas 12x15 + tarima 72 m2" }),
      evento({ id: "pena", tipo_evento: "larga_duracion", es_larga_duracion: true, importe: null, fecha_inicio: "2026-06-01" }),
    ];
    const gastos: GastoPyg[] = [
      { evento_id: "boda", base: 1300, fecha: "2026-09-02", categoria: "montadores" },
      { evento_id: null, base: 250, fecha: "2026-08-28", categoria: "gestoria" },
      { evento_id: null, base: 350, fecha: "2026-10-06", categoria: "material_carpas" },
      { evento_id: null, base: 1100, fecha: "2026-08-31", categoria: "director" },
    ];
    const facturas = [
      { evento_id: "boda", importe: 2400, estado: "pagada", fecha_emision: "2026-05-10" }, // reserva de la boda de agosto
      { evento_id: "boda", importe: 3600, estado: "emitida", fecha_emision: "2026-08-20" },
      { evento_id: "pena", importe: 670, estado: "pagada", fecha_emision: "2026-08-31" },
      { evento_id: "pena", importe: 670, estado: "prevista", fecha_emision: null },
      { evento_id: null, importe: 100, estado: "emitida", fecha_emision: "2026-08-05" },
    ];
    const p = calcularPyg(2026, eventos, gastos, facturas, [], [], nombres);
    const [may, ago, sep] = [4, 7, 8];
    expect(p.ingresos.meses[may]).toBe(2400);
    const ago_ = new Map(p.porTipo.map((f) => [f.clave, f.meses[ago]]));
    expect(p.porTipo[0].clave).toBe("Carpas beduinas"); // siempre las 13 del Excel, en su orden
    expect([ago_.get("Carpas beduinas + Tarima"), ago_.get("Alquiler"), ago_.get("Otros"), ago_.get("Sombrillas")]).toEqual([3600, 670, 100, 0]);
    expect(p.porVariable.map((f) => [f.clave, f.meses[sep]])).toEqual([["montadores", 1300]]); // sin comisión prevista
    expect(p.fijos.meses[ago]).toBe(250); // la factura del director va a personal, no a fijos
    expect(p.director.meses[ago]).toBe(1100);
    expect(p.fijos.meses[9]).toBe(0);
    expect(p.ebitda.meses[ago]).toBe(4370 - 250 - 1100);
  });

  it("el impuesto va sobre el acumulado y el mes con pérdidas compensa", () => {
    const facturas = [{ evento_id: null, importe: 1000, estado: "emitida", fecha_emision: "2026-02-10" }, { evento_id: null, importe: 3000, estado: "emitida", fecha_emision: "2026-03-10" }];
    const manual = [{ mes: "2026-01-01", concepto: "bonus" as const, importe: 2000 }];
    const p = calcularPyg(2026, [], [], facturas, [], manual, nombres);
    expect(p.impuesto.meses.slice(0, 3)).toEqual([0, 0, 300]); // (−2000 + 1000 + 3000) × 15 %
    expect(p.impuesto.total).toBe(300);
    expect(p.neto.total).toBe(1700);
  });

  it("categorías de ingreso como en el Excel", async () => {
    const { categoriaIngreso } = await import("../pyg");
    const c = (material: string, x = {}) => categoriaIngreso(evento({ material, ...x }));
    expect(c("2 carpas beduinas + guirnaldas")).toBe("Carpas beduinas + guirnaldas");
    expect(c("1 carpa beduina + tarima 64 m2 + guirnaldas + vegetación")).toBe("Carpas beduinas + Tarima + Guirnaldas + Vegetación");
    expect(c("2 carpas modulares 6x6 + tarima 36 m2")).toBe("Carpas modulares + Tarima");
    expect(c("1 carpa beduina + 2 carpas modulares + tarima 72 m2")).toBe("Carpas beduinas + Carpas modulares + Tarima");
    expect(c("4 sombrillas")).toBe("Sombrillas");
    expect(c("Comisión Gilca")).toBe("Comisión");
    expect(c("2 beduinas", { estado: "cancelado_reserva_retenida" })).toBe("Reserva");
    // Cada factura según lo que cobra: la descripción manda sobre el material del evento
    const boda = evento({ material: "2 carpas tensadas 15x12 + tarima 8x8" });
    expect(categoriaIngreso(boda, { tipo: "resto", descripcion: "Tarima 64 m2" })).toBe("Tarima");
    expect(categoriaIngreso(boda, { tipo: "reserva", descripcion: "Reserva 30 %" })).toBe("Reserva");
    expect(categoriaIngreso(boda, { tipo: "resto", descripcion: "Resto del evento" })).toBe("Carpas beduinas + Tarima");
    expect(categoriaIngreso(boda, { tipo: "mensualidad" })).toBe("Alquiler");
    expect(categoriaIngreso(undefined, { tipo: "otra", descripcion: "Comisión boda" })).toBe("Comisión");
  });
});
