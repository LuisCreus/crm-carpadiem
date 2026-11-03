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

  it("ingresos por tipo en el mes del evento; gastos del evento en su mes; fijos en el de la factura; el CAPEX fuera", () => {
    const eventos = [
      evento({ id: "boda", comision_pct: 10 }),
      evento({ id: "pena", tipo_evento: "larga_duracion", es_larga_duracion: true, importe: null, fecha_inicio: "2026-06-01" }),
      evento({ id: "sin", fecha_precision: "por_definir", fecha_inicio: null }),
      evento({ id: "caido", estado: "cancelado" }),
    ];
    const gastos: GastoPyg[] = [
      { evento_id: "boda", base: 1300, fecha: "2026-09-02", categoria: "montadores" },
      { evento_id: null, base: 250, fecha: "2026-08-28", categoria: "gestoria" },
      { evento_id: null, base: 350, fecha: "2026-10-06", categoria: "material_carpas" },
      { evento_id: null, base: 1100, fecha: "2026-08-31", categoria: "director" },
    ];
    const facturas = [
      { evento_id: "pena", importe: 670, estado: "pagada", fecha_emision: "2026-08-31" },
      { evento_id: "pena", importe: 670, estado: "prevista", fecha_emision: null },
    ];
    const p = calcularPyg(2026, eventos, gastos, facturas, [], [], nombres);
    const ago = 7;
    expect(p.porTipo.map((f) => [f.nombre, f.meses[ago]])).toEqual([["Boda", 6000], ["Proyecto de larga duración", 670]]);
    expect(p.ingresos.meses[ago]).toBe(6670);
    expect(p.porVariable.map((f) => [f.clave, f.meses[ago]])).toEqual([["montadores", 1300], ["comisiones", 600]]);
    expect(p.fijos.meses[ago]).toBe(250); // la factura del director va a personal, no a fijos
    expect(p.director.meses[ago]).toBe(1100);
    expect(p.fijos.meses[9]).toBe(0);
    expect(p.ebitda.meses[ago]).toBe(6670 - 1900 - 250 - 1100);
    expect(p.sinFecha).toBe(1);
  });

  it("el impuesto va sobre el acumulado y el mes con pérdidas compensa", () => {
    const eventos = [evento({ id: "a", fecha_inicio: "2026-02-10", importe: 1000 }), evento({ id: "b", fecha_inicio: "2026-03-10", importe: 3000 })];
    const manual = [{ mes: "2026-01-01", concepto: "director" as const, importe: 2000 }];
    const p = calcularPyg(2026, eventos, [], [], [], manual, nombres);
    expect(p.impuesto.meses.slice(0, 3)).toEqual([0, 0, 300]); // (−2000 + 1000 + 3000) × 15 %
    expect(p.impuesto.total).toBe(300);
    expect(p.neto.total).toBe(1700);
  });
});
