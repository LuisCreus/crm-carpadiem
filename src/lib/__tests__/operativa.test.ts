import { describe, expect, it } from "vitest";
import {
  calcularAvisos, controlMaterial, numerosPeriodo, rangoOcupacion, reservas, semanaDe, solapesMaterial,
  type EventoAvisos,
} from "../operativa";

describe("control de material", () => {
  it("OK, FALTAN, SOBRAN y pendiente de volver", () => {
    const r = controlMaterial([
      { material: "Picas 1 m", cantidad: 32, sentido: "sale" },
      { material: "picas 1 m ", cantidad: 23, sentido: "entra" },
      { material: "Carpa 12x15", cantidad: 2, sentido: "sale" },
      { material: "Carpa 12x15", cantidad: 2, sentido: "entra" },
      { material: "Slingers", cantidad: 16, sentido: "sale" },
      { material: "Slingers", cantidad: 17, sentido: "entra" },
      { material: "Motos", cantidad: 2, sentido: "sale" },
    ]);
    const por = Object.fromEntries(r.map((l) => [l.material, l]));
    expect(por["Picas 1 m"]).toMatchObject({ estado: "faltan", diferencia: -9 });
    expect(por["Carpa 12x15"].estado).toBe("ok");
    expect(por["Slingers"]).toMatchObject({ estado: "sobran", diferencia: 1 });
    expect(por["Motos"].estado).toBe("pendiente");
  });
});

describe("ocupación de material", () => {
  const inventario = [{ id: "beduina", material: "Beduina 12x15", cantidad: 3 }];

  it("avisa cuando eventos solapados piden más de lo que hay", () => {
    const s = solapesMaterial([
      { id: "a", nombre: "Boda A", desde: "2027-05-07", hasta: "2027-05-09", material: [{ inventarioId: "beduina", cantidad: 2 }] },
      { id: "b", nombre: "Boda B", desde: "2027-05-08", hasta: "2027-05-10", material: [{ inventarioId: "beduina", cantidad: 2 }] },
      { id: "c", nombre: "Boda C", desde: "2027-05-20", hasta: "2027-05-21", material: [{ inventarioId: "beduina", cantidad: 3 }] },
    ], inventario);
    expect(s).toEqual([{
      inventarioId: "beduina", material: "Beduina 12x15", desde: "2027-05-08", hasta: "2027-05-09",
      pedido: 4, disponible: 3, eventos: ["Boda A", "Boda B"], eventoIds: ["a", "b"],
    }]);
  });

  it("cuenta los proyectos de larga duración durante todo su periodo", () => {
    const s = solapesMaterial([
      { id: "p", nombre: "Peñalagos", desde: "2026-07-01", hasta: "2027-06-30", material: [{ inventarioId: "beduina", cantidad: 1 }] },
      { id: "b", nombre: "Boda", desde: "2026-09-05", hasta: "2026-09-06", material: [{ inventarioId: "beduina", cantidad: 3 }] },
    ], inventario);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ desde: "2026-09-05", hasta: "2026-09-06", pedido: 4 });
  });

  it("el material está fuera desde el montaje hasta el desmontaje", () => {
    expect(rangoOcupacion({
      fecha_precision: "dia", fecha_inicio: "2027-05-08", fecha_fin: null,
      montaje_inicio: "2027-05-06T09:00:00+02:00", desmontaje_inicio: "2027-05-10T10:00:00+02:00",
    })).toEqual({ desde: "2027-05-06", hasta: "2027-05-10" });
    expect(rangoOcupacion({ fecha_precision: "mes", fecha_inicio: "2027-06-01", fecha_fin: null })).toEqual({ desde: "2027-06-01", hasta: "2027-06-30" });
    expect(rangoOcupacion({ fecha_precision: "por_definir", fecha_inicio: null, fecha_fin: null })).toBeNull();
  });
});

describe("avisos del Inicio", () => {
  const ajustes = { diasSeguimiento: 7, diasLimiteSeguro: 10, diasAvisoSeguro: 3 };
  const evento = (e: Partial<EventoAvisos>): EventoAvisos => ({
    id: "e", cliente: "Cliente", estado: "activo", modalidad: "confirmado", fecha_precision: "dia",
    fecha_inicio: "2026-12-05", fecha_fin: null, montaje_inicio: null, desmontaje_inicio: null,
    importe: 1000, cobrado: 0, ubicacion: "Madrid", ...e,
  });

  it("seguimiento 7 días después de enviado", () => {
    const pres = [
      { id: "1", codigo: "CD 079", cliente: "Ortega", estado: "pendiente" as const, enviado_at: "2026-10-21T10:00:00Z" },
      { id: "2", codigo: "CD 080", cliente: "Ruiz", estado: "pendiente" as const, enviado_at: "2026-10-25T10:00:00Z" },
    ];
    const a = calcularAvisos("2026-10-28", { presupuestos: pres, eventos: [], leads: [] }, ajustes);
    expect(a.map((x) => x.titulo)).toEqual(["CD 079 · Ortega"]);
  });

  it("montaje mañana, plazo de seguro y cobro pendiente tras el evento", () => {
    const a = calcularAvisos("2026-10-28", {
      presupuestos: [], leads: [],
      eventos: [
        evento({ id: "m", cliente: "Montaje", montaje_inicio: "2026-10-29T09:00:00+01:00" }),
        evento({ id: "s", cliente: "Seguro", modalidad: "seguro", fecha_inicio: "2026-11-09" }), // límite 30/10
        evento({ id: "c", cliente: "Cobro", fecha_inicio: "2026-10-18", importe: 3900, cobrado: 1750 }),
        evento({ id: "ok", cliente: "Cobrado", fecha_inicio: "2026-10-18", importe: 1000, cobrado: 1000 }),
      ],
    }, ajustes);
    const tipos = Object.fromEntries(a.map((x) => [x.titulo, x.tipo]));
    expect(tipos).toEqual({ Montaje: "montaje", Seguro: "seguro", Cobro: "cobro" });
    expect(a.find((x) => x.tipo === "montaje")!.urgente).toBe(true);
  });

  it("la semana va de lunes a domingo", () => {
    expect(semanaDe("2026-10-28")).toEqual({ desde: "2026-10-26", hasta: "2026-11-01" });
  });
});

describe("números del Inicio", () => {
  const p = (estado: string, enviado: string | null, importe: number, reserva = 30, cobrado = 0) =>
    ({ estado: estado as never, enviado_at: enviado, importe, reserva_pct: reserva, cobrado });

  it("enviados, aceptación y € del mes", () => {
    const lista = [
      p("pendiente", "2026-10-02T10:00:00Z", 10000),
      p("aceptado", "2026-10-05T10:00:00Z", 5000),
      p("rechazado", "2026-10-07T10:00:00Z", 3000),
      p("pagado", "2026-09-30T10:00:00Z", 2000),
      p("borrador", null, 1000),
    ];
    expect(numerosPeriodo(lista, "2026-10")).toEqual({ enviados: 3, aceptados: 1, tasaAceptacion: 1 / 3, presupuestado: 18000, aceptado: 5000 });
    expect(numerosPeriodo(lista, "2026").enviados).toBe(4);
  });

  it("los importados sin fecha de envío cuentan en el año de su número, no en el mes", () => {
    const lista = [
      { ...p("pagado", null, 4000), anio: 2026 },
      { ...p("caducado", null, 1000), anio: 2026 },
      { ...p("borrador", null, 500), anio: 2026 },
    ];
    expect(numerosPeriodo(lista, "2026")).toEqual({ enviados: 2, aceptados: 1, tasaAceptacion: 0.5, presupuestado: 5000, aceptado: 4000 });
    expect(numerosPeriodo(lista, "2026-10").enviados).toBe(0);
  });

  it("reservas cobradas frente a pendientes", () => {
    expect(reservas([p("aceptado", null, 10000, 30, 1000), p("reserva_pagada", null, 1000, 30, 300)]))
      .toEqual({ cobradas: 1300, pendientes: 2000 });
  });
});
