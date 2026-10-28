import { describe, expect, it } from "vitest";
import { diasCalendario, empiezaEnMes, estaEnMes, mesesDelPeriodo, textoDias } from "../planificacion";

describe("planificación", () => {
  it("12 meses de un año o los próximos 12", () => {
    expect(mesesDelPeriodo(2027, "2026-10-28")[0]).toEqual({ anio: 2027, mes: 1 });
    const prox = mesesDelPeriodo("proximos", "2026-10-28");
    expect(prox[0]).toEqual({ anio: 2026, mes: 10 });
    expect(prox[11]).toEqual({ anio: 2027, mes: 9 });
  });

  it("un proyecto largo aparece en todos los meses que ocupa, con su importe solo en el primero", () => {
    const penalagos = { fecha_precision: "dia" as const, inicio: "2026-07-01", fin: "2026-08-31" };
    expect(estaEnMes(penalagos, { anio: 2026, mes: 7 })).toBe(true);
    expect(estaEnMes(penalagos, { anio: 2026, mes: 8 })).toBe(true);
    expect(estaEnMes(penalagos, { anio: 2026, mes: 9 })).toBe(false);
    expect(empiezaEnMes(penalagos, { anio: 2026, mes: 8 })).toBe(false);
    expect(textoDias(penalagos, { anio: 2026, mes: 8 })).toBe("01–31");
  });

  it("solo mes y por definir", () => {
    expect(estaEnMes({ fecha_precision: "mes", inicio: "2027-06-01", fin: null }, { anio: 2027, mes: 6 })).toBe(true);
    expect(textoDias({ fecha_precision: "mes", inicio: "2027-06-01", fin: null }, { anio: 2027, mes: 6 })).toBe("s/d");
    expect(estaEnMes({ fecha_precision: "por_definir", inicio: null, fin: null }, { anio: 2027, mes: 6 })).toBe(false);
  });

  it("evento de un día y de varios días dentro del mes", () => {
    expect(textoDias({ fecha_precision: "dia", inicio: "2027-05-08", fin: null }, { anio: 2027, mes: 5 })).toBe("08");
    expect(textoDias({ fecha_precision: "dia", inicio: "2027-05-08", fin: "2027-05-10" }, { anio: 2027, mes: 5 })).toBe("08–10");
  });

  it("calendario empieza en lunes", () => {
    const dias = diasCalendario(2026, 11); // 1/11/2026 es domingo
    expect(dias.slice(0, 7)).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(dias.length % 7).toBe(0);
  });
});
