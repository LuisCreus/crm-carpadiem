import { describe, expect, it } from "vitest";
import { eventosCercanos, porRevisar, type EventoRevision } from "../emparejamiento";

const ev = (id: string, fecha_inicio: string | null, x: Partial<EventoRevision> = {}): EventoRevision =>
  ({ id, cliente: id, estado: "activo", fecha_inicio, es_larga_duracion: false, montaje_revisado: false, ...x });

describe("revisar emparejamiento", () => {
  it("eventos más cercanos a la fecha de la factura primero, sin cancelados", () => {
    const l = eventosCercanos("2026-06-14", [ev("jaquete", "2026-06-12"), ev("cristina", "2026-06-13"), ev("sin", null), ev("caido", "2026-06-14", { estado: "cancelado" }), ev("richi", "2026-06-20")]);
    expect(l.map((e) => e.id)).toEqual(["cristina", "jaquete", "richi", "sin"]);
  });

  it("gastos de evento sin evento, facturas sin evento y eventos pasados sin montadores", () => {
    const r = porRevisar("2026-11-04",
      [ev("rous", "2026-05-09"), ev("propio", "2026-05-10", { montaje_revisado: true }), ev("richi", "2026-06-20"), ev("futuro", "2027-07-24"), ev("pena", "2026-06-01", { es_larga_duracion: true })],
      [
        { id: "furgo", evento_id: null, categoria: "furgoneta", fecha: "2026-05-11" },
        { id: "web", evento_id: null, categoria: "web", fecha: "2026-05-27" },
        { id: "monta", evento_id: "richi", categoria: "montadores", fecha: "2026-06-18" },
      ],
      [{ id: "f11", evento_id: null, estado: "emitida", fecha_emision: "2026-06-18" }, { id: "prev", evento_id: null, estado: "prevista", fecha_emision: null }],
      new Set(["furgoneta", "montadores"]));
    expect(r.gastosSinEvento.map((g) => g.id)).toEqual(["furgo"]);
    expect(r.facturasSinEvento.map((f) => f.id)).toEqual(["f11"]);
    expect(r.eventosSinMontaje.map((e) => e.id)).toEqual(["rous"]);
  });
});
