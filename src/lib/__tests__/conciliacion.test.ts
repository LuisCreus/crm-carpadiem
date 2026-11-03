import { describe, expect, it } from "vitest";
import { patronSugerido, proponer, type EmitidaC, type RecibidaC, type ReglaC } from "../conciliacion";

const emitidas: EmitidaC[] = [
  { id: "e25", codigo: "CD 2026/25", anio: 2026, numero: 25, total: 810.7, estado: "emitida", cliente: "Entidad Urbanística Peñalagos" },
  { id: "e13", codigo: "CD 2026/13", anio: 2026, numero: 13, total: 810.7, estado: "pagada", cliente: "Entidad Urbanística Peñalagos" },
  { id: "e23", codigo: "CD 2026/23", anio: 2026, numero: 23, total: 1391.5, estado: "emitida", cliente: "Clara García-Quirós" },
];
const recibidas: RecibidaC[] = [
  { id: "r19", numero: "00019", total: 1742.4, estado: "pendiente", proveedor: "David Mendoza", fecha: "2026-10-07" },
  { id: "r7", numero: "7", total: 1331, estado: "pagada", proveedor: "MAKETA INVESTMENTS SL", fecha: "2026-10-27" },
];
const reglas: ReglaC[] = [{ id: "g1", patron: "Microsoft", categoria: "microsoft", proveedor_id: null, ignorar: false }];
const mov = (concepto: string, importe: number) => ({ id: "m", fecha: "2026-10-28", concepto, importe });

describe("conciliación con el banco", () => {
  it("cobro: la factura con ese total y su número en el concepto, aunque haya otra con el mismo importe", () => {
    const p = proponer(mov("TRANSFERENCIA ENTIDAD URBANISTICA PENALAGOS FRA CD 2026/25", 810.7), emitidas, recibidas, reglas);
    expect(p).toMatchObject({ tipo: "cobro", factura: { id: "e25" }, seguro: true });
  });

  it("cobro sin pistas pero con un único importe igual", () => {
    expect(proponer(mov("TRANSF 9981", 1391.5), emitidas, recibidas, reglas)).toMatchObject({ tipo: "cobro", factura: { id: "e23" }, seguro: true });
  });

  it("pago a proveedor (también las ya marcadas como pagadas, para enlazarlas)", () => {
    expect(proponer(mov("TRANSFERENCIA A DAVID ALEJANDRO MENDOZA GIL", -1742.4), emitidas, recibidas, reglas)).toMatchObject({ tipo: "pago", recibida: { id: "r19" }, seguro: true });
    expect(proponer(mov("TRANSFERENCIA MAKETA INVESTMENTS", -1331), emitidas, recibidas, reglas)).toMatchObject({ tipo: "pago", recibida: { id: "r7" } });
  });

  it("si la factura ya está enlazada a otro movimiento no se propone otra vez", () => {
    expect(proponer(mov("TRANSF 9981", 1391.5), emitidas, recibidas, reglas, new Set(["e23"]))).toBeNull();
  });

  it("sin factura: la regla guardada por el concepto", () => {
    expect(proponer(mov("RECIBO MICROSOFT IRELAND OPERATIONS", -12.96), emitidas, recibidas, reglas)).toMatchObject({ tipo: "regla", regla: { id: "g1" } });
    expect(proponer(mov("COMPRA TARJETA REPSOL 4471", -45.61), emitidas, recibidas, reglas)).toBeNull();
  });

  it("patrón propuesto para recordar un movimiento", () => {
    expect(patronSugerido("RECIBO MICROSOFT IRELAND OPERATIONS 4471")).toBe("MICROSOFT IRELAND");
    expect(patronSugerido("COMPRA TARJETA 4471 REPSOL ESTACION")).toBe("REPSOL ESTACION");
  });
});

describe("revisión: casos límite", () => {
  it("«CD 2026/50» no se confunde con la 2026/5", () => {
    const fs: EmitidaC[] = [
      { id: "e5", codigo: "CD 2026/5", anio: 2026, numero: 5, total: 121, estado: "emitida", cliente: "A" },
      { id: "e50", codigo: "CD 2026/50", anio: 2026, numero: 50, total: 121, estado: "pagada", cliente: "B" },
    ];
    expect(proponer({ id: "m", fecha: "2026-11-01", concepto: "TRANSF CD 2026/50", importe: 121 }, fs, [], [])).toMatchObject({ factura: { id: "e50" } });
    expect(proponer({ id: "m", fecha: "2026-11-01", concepto: "Pago Fra. Cd2026/5", importe: 121 }, fs, [], [])).toMatchObject({ factura: { id: "e5" }, seguro: true });
  });
});
