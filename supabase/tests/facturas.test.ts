import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { comoUsuario, crearBaseDePrueba, crearUsuario } from "./pg-prueba";

let db: PGlite;
let jimena: string;

beforeEach(async () => {
  db = await crearBaseDePrueba();
  await crearUsuario(db, "lcreus@carpa-diem.com");
  jimena = await crearUsuario(db, "jimena@carpa-diem.com");
});

const como = <T>(fn: () => Promise<T>) => comoUsuario(db, jimena, fn);

type Fila = { id: string; tipo: string; importe: string; estado: string; codigo: string | null; automatica: boolean };

async function presupuestoAceptado(importe: number, reservaPct: number | null) {
  const { rows } = await como(() => db.query<{ id: string }>("select id from public.crear_presupuesto($1)", [JSON.stringify({
    cliente_nombre: "Carlota Durán", tipo_cliente: "particular", tipo_evento: "boda", fecha_precision: "dia",
    fecha_evento: "2027-05-08", ubicacion: "Toledo", material: "2 beduinas", reserva_pct: reservaPct,
  })]));
  const id = rows[0].id;
  await como(() => db.query("update public.presupuestos set importe = $2 where id = $1", [id, importe]));
  await como(() => db.query("select public.aceptar_presupuesto($1)", [id]));
  const ev = await db.query<{ id: string; cliente_id: string }>("select id, cliente_id from public.eventos where presupuesto_id = $1", [id]);
  return { presupuestoId: id, eventoId: ev.rows[0].id, clienteId: ev.rows[0].cliente_id };
}

async function facturas(eventoId: string) {
  const { rows } = await db.query<Fila>(
    "select id, tipo, importe::text, estado, codigo, automatica from public.facturas where evento_id = $1 and deleted_at is null order by tipo",
    [eventoId]);
  return rows;
}

async function datosFiscales(clienteId: string) {
  await como(() => db.query("update public.clientes set fact_nombre = 'Carlota Durán', fact_nif = '12345678Z' where id = $1", [clienteId]));
}

describe("plan de facturas del evento", () => {
  it("al aceptar: Reserva (importe × %) y Resto", async () => {
    const { eventoId } = await presupuestoAceptado(10000, 30);
    expect((await facturas(eventoId)).map((f) => [f.tipo, f.importe, f.estado])).toEqual([
      ["reserva", "3000.00", "prevista"],
      ["resto", "7000.00", "prevista"],
    ]);
  });

  it("sin % de reserva: una sola factura por el total", async () => {
    const { eventoId } = await presupuestoAceptado(5000, null);
    expect((await facturas(eventoId)).map((f) => [f.tipo, f.importe])).toEqual([["resto", "5000.00"]]);
  });

  it("se recalcula si cambia el importe o el % de reserva", async () => {
    const { presupuestoId, eventoId } = await presupuestoAceptado(10000, 30);
    await como(() => db.query("update public.presupuestos set importe = 12000, reserva_pct = 20 where id = $1", [presupuestoId]));
    expect((await facturas(eventoId)).map((f) => [f.tipo, f.importe])).toEqual([["reserva", "2400.00"], ["resto", "9600.00"]]);
  });

  it("una factura añadida a mano se descuenta del resto", async () => {
    const { eventoId, clienteId } = await presupuestoAceptado(10000, 30);
    await como(() => db.query("insert into public.facturas (evento_id, cliente_id, tipo, concepto, importe) values ($1, $2, 'otra', 'Tarima', 1000)", [eventoId, clienteId]));
    expect((await facturas(eventoId)).map((f) => [f.tipo, f.importe])).toEqual([["otra", "1000.00"], ["reserva", "3000.00"], ["resto", "6000.00"]]);
  });

  it("si se cambia a mano la reserva, se respeta y el resto se ajusta", async () => {
    const { eventoId } = await presupuestoAceptado(10000, 30);
    const reserva = (await facturas(eventoId)).find((f) => f.tipo === "reserva")!;
    await como(() => db.query("update public.facturas set importe = 2500 where id = $1", [reserva.id]));
    const lista = await facturas(eventoId);
    expect(lista.map((f) => [f.tipo, f.importe, f.automatica])).toEqual([["reserva", "2500.00", false], ["resto", "7500.00", true]]);
  });

  it("si se cancela el evento, desaparecen las previstas", async () => {
    const { presupuestoId, eventoId } = await presupuestoAceptado(10000, 30);
    await como(() => db.query("update public.presupuestos set estado = 'rechazado' where id = $1", [presupuestoId]));
    expect(await facturas(eventoId)).toEqual([]);
  });
});

describe("emitir y cobrar", () => {
  it("emitir pide los datos de facturación", async () => {
    const { eventoId } = await presupuestoAceptado(10000, 30);
    const reserva = (await facturas(eventoId)).find((f) => f.tipo === "reserva")!;
    await expect(como(() => db.query("select public.emitir_factura($1)", [reserva.id]))).rejects.toThrow(/datos de facturación/);
  });

  it("numera CD AAAA/n seguido y sin repetir, continuando desde el último", async () => {
    await db.query("insert into public.numeracion_facturas (anio, ultimo_numero) values (extract(year from now())::int, 25)");
    const a = await presupuestoAceptado(10000, 30);
    await datosFiscales(a.clienteId);
    const reserva = (await facturas(a.eventoId)).find((f) => f.tipo === "reserva")!;
    const r1 = await como(() => db.query<{ c: string }>("select public.emitir_factura($1) c", [reserva.id]));
    // El resto se recalcula al emitir (fila nueva): se vuelve a leer
    const resto = (await facturas(a.eventoId)).find((f) => f.tipo === "resto")!;
    const r2 = await como(() => db.query<{ c: string }>("select public.emitir_factura($1) c", [resto.id]));
    const anio = new Date().getFullYear();
    expect([r1.rows[0].c, r2.rows[0].c]).toEqual([`CD ${anio}/26`, `CD ${anio}/27`]);
    await expect(como(() => db.query("select public.emitir_factura($1)", [reserva.id]))).rejects.toThrow(/ya está emitida/);
  });

  it("pagada → apunta el cobro y el presupuesto pasa a Reserva pagada; desmarcar lo quita", async () => {
    const a = await presupuestoAceptado(10000, 30);
    await datosFiscales(a.clienteId);
    const reserva = (await facturas(a.eventoId)).find((f) => f.tipo === "reserva")!;
    await como(() => db.query("select public.emitir_factura($1)", [reserva.id]));
    await como(() => db.query("select public.marcar_factura_pagada($1, '2026-11-02')", [reserva.id]));
    const estado = async () => (await db.query<{ estado: string }>("select estado from public.presupuestos where id = $1", [a.presupuestoId])).rows[0].estado;
    expect(await estado()).toBe("reserva_pagada");
    const cobros = await db.query<{ importe: string; notas: string }>("select importe::text, notas from public.cobros where presupuesto_id = $1 and deleted_at is null", [a.presupuestoId]);
    expect(cobros.rows[0].importe).toBe("3000.00");
    expect(cobros.rows[0].notas).toMatch(/^Factura CD \d{4}\/1$/);

    await como(() => db.query("select public.desmarcar_factura_pagada($1)", [reserva.id]));
    expect(await estado()).toBe("aceptado");
  });

  it("una factura emitida no se borra ni cambia de importe, y el número no se toca a mano", async () => {
    const a = await presupuestoAceptado(10000, 30);
    await datosFiscales(a.clienteId);
    const reserva = (await facturas(a.eventoId)).find((f) => f.tipo === "reserva")!;
    await como(() => db.query("select public.emitir_factura($1)", [reserva.id]));
    await expect(como(() => db.query("select public.papelera_mover('facturas', $1)", [reserva.id]))).rejects.toThrow(/no se puede borrar/);
    await expect(como(() => db.query("update public.facturas set importe = 1 where id = $1", [reserva.id]))).rejects.toThrow(/no se puede cambiar/);
    await expect(como(() => db.query("update public.facturas set numero = 99 where id = $1", [reserva.id]))).rejects.toThrow(/permission denied/);
  });

  it("al emitir la reserva por otro importe, el resto se recalcula", async () => {
    const a = await presupuestoAceptado(10000, 30);
    await datosFiscales(a.clienteId);
    const reserva = (await facturas(a.eventoId)).find((f) => f.tipo === "reserva")!;
    await como(() => db.query("update public.facturas set importe = 2000 where id = $1", [reserva.id]));
    await como(() => db.query("select public.emitir_factura($1)", [reserva.id]));
    expect((await facturas(a.eventoId)).map((f) => [f.tipo, f.importe, f.estado])).toEqual([["reserva", "2000.00", "emitida"], ["resto", "8000.00", "prevista"]]);
  });
});
