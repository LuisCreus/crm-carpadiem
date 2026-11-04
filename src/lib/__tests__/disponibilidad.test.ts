import { describe, expect, it } from "vitest";
import { diasMaterial, faltas, siSeAcepta, textoFalta, type Compromiso } from "../disponibilidad";

const hay = { beduinas: 3, modulares: 4, tarima_m2: 72, sombrillas: 5 };
const c = (id: string, desde: string, hasta: string, x: Partial<Compromiso["cantidades"]>): Compromiso =>
  ({ id, nombre: id, desde, hasta, cantidades: { beduinas: 0, modulares: 0, tarima_m2: 0, sombrillas: 0, ...x } });

describe("disponibilidad de material", () => {
  it("días: del montaje al desmontaje; si no hay, el día antes y el después; larga duración, todo", () => {
    expect(diasMaterial({ fecha_precision: "dia", fecha_inicio: "2027-07-24", fecha_fin: null })).toEqual({ desde: "2027-07-23", hasta: "2027-07-25" });
    expect(diasMaterial({ fecha_precision: "dia", fecha_inicio: "2027-07-24", fecha_fin: null, montaje_inicio: "2027-07-22T08:00:00Z", desmontaje_inicio: "2027-07-26T08:00:00Z" }))
      .toEqual({ desde: "2027-07-22", hasta: "2027-07-26" });
    expect(diasMaterial({ fecha_precision: "dia", fecha_inicio: "2026-06-01", fecha_fin: "2026-11-30", es_larga_duracion: true })).toEqual({ desde: "2026-06-01", hasta: "2026-11-30" });
    expect(diasMaterial({ fecha_precision: "por_definir", fecha_inicio: null, fecha_fin: null })).toBeNull();
  });

  it("avisa cuando dos eventos que se tocan piden más beduinas de las que hay", () => {
    const f = faltas([c("boda", "2027-07-23", "2027-07-25", { beduinas: 2 }), c("fiesta", "2027-07-25", "2027-07-27", { beduinas: 2, tarima_m2: 72 })], hay);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ recurso: "beduinas", desde: "2027-07-25", hasta: "2027-07-25", pedido: 4, disponible: 3 });
    expect(textoFalta(f[0])).toBe("Falta 1 beduina (se piden 4, hay 3)");
  });

  it("un presupuesto pendiente: qué faltaría si se acepta", () => {
    const confirmados = [c("boda", "2027-05-07", "2027-05-09", { beduinas: 2, tarima_m2: 40 })];
    const nuevo = c("CD 076", "2027-05-07", "2027-05-09", { beduinas: 1, tarima_m2: 180, modulares: 3 });
    expect(siSeAcepta(nuevo, confirmados, hay).map((x) => [x.recurso, x.pedido])).toEqual([["tarima_m2", 220]]);
    expect(siSeAcepta(c("otro", "2027-08-01", "2027-08-02", { beduinas: 3 }), confirmados, hay)).toEqual([]);
  });
});
