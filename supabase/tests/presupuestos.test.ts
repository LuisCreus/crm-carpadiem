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

type Presu = { id: string; codigo: string; estado: string; oportunidad_id: string; cliente_id: string };

async function crear(datos: Record<string, unknown>): Promise<Presu> {
  return como(async () => {
    const { rows } = await db.query<Presu>(
      "select id, codigo, estado, oportunidad_id, cliente_id from public.crear_presupuesto($1)",
      [JSON.stringify(datos)]);
    return rows[0];
  });
}

async function estado(id: string) {
  const { rows } = await db.query<{ estado: string }>("select estado from public.presupuestos where id = $1", [id]);
  return rows[0].estado;
}

async function cobrar(id: string, importe: number) {
  return como(() => db.query("insert into public.cobros (presupuesto_id, importe) values ($1, $2)", [id, importe]));
}

const BASE = {
  cliente_nombre: "Carlota Durán",
  tipo_cliente: "particular",
  tipo_evento: "boda",
  fecha_precision: "dia",
  fecha_evento: "2027-05-08",
  material: "2 beduinas 12x15 + tarima 72 m²",
  reserva_pct: 30,
  contactos: [{ nombre: "Carlota Durán", rol: "novios", telefono: "600000000", email: "c@ejemplo.com" }, { nombre: "" }],
};

describe("crear presupuesto", () => {
  it("crea cliente, contactos, oportunidad, número y V01 de una vez", async () => {
    const p = await crear(BASE);
    expect(p.codigo).toMatch(/^CD \d{3}$/);
    expect(p.estado).toBe("borrador");
    const contactos = await db.query("select nombre from public.contactos where cliente_id = $1", [p.cliente_id]);
    expect(contactos.rows).toHaveLength(1);
    const versiones = await db.query<{ version: number }>(
      "select version from public.presupuesto_versiones where presupuesto_id = $1", [p.id]);
    expect(versiones.rows.map((v) => v.version)).toEqual([1]);
  });

  it("una segunda opción reutiliza el cliente y la oportunidad", async () => {
    const a = await crear(BASE);
    const b = await crear({ ...BASE, cliente_id: a.cliente_id, oportunidad_id: a.oportunidad_id, contactos: [] });
    expect(b.oportunidad_id).toBe(a.oportunidad_id);
    expect(b.codigo).not.toBe(a.codigo);
  });

  it("nueva versión numera V02, V03…", async () => {
    const p = await crear(BASE);
    const r1 = await como(() => db.query<{ v: number }>("select public.nueva_version($1) as v", [p.id]));
    const r2 = await como(() => db.query<{ v: number }>("select public.nueva_version($1) as v", [p.id]));
    expect([r1.rows[0].v, r2.rows[0].v]).toEqual([2, 3]);
  });
});

describe("enviar, aceptar y opciones", () => {
  it("marcar como enviado pasa de Borrador a Pendiente y guarda la versión", async () => {
    const p = await crear(BASE);
    await como(() => db.query("select public.marcar_enviado($1, 1)", [p.id]));
    const { rows } = await db.query<{ estado: string; version_enviada: number; enviado_at: string | null }>(
      "select estado, version_enviada, enviado_at from public.presupuestos where id = $1", [p.id]);
    expect(rows[0].estado).toBe("pendiente");
    expect(rows[0].version_enviada).toBe(1);
    expect(rows[0].enviado_at).not.toBeNull();
  });

  it("aceptar crea el evento y descarta las demás opciones", async () => {
    const a = await crear(BASE);
    const b = await crear({ ...BASE, cliente_id: a.cliente_id, oportunidad_id: a.oportunidad_id, contactos: [] });
    await como(() => db.query("select public.marcar_enviado($1, 1)", [b.id]));

    await como(() => db.query("select public.aceptar_presupuesto($1, 'seguro')", [a.id]));

    expect(await estado(a.id)).toBe("aceptado");
    expect(await estado(b.id)).toBe("descartada");
    const ev = await db.query<{ modalidad: string; fecha_inicio: string; material: string }>(
      "select modalidad, fecha_inicio::text, material from public.eventos where presupuesto_id = $1", [a.id]);
    expect(ev.rows[0]).toEqual({ modalidad: "seguro", fecha_inicio: "2027-05-08", material: BASE.material });
  });

  it("si deja de estar aceptado, el evento se cancela; al volver a aceptarlo se reactiva", async () => {
    const p = await crear(BASE);
    await como(() => db.query("select public.aceptar_presupuesto($1)", [p.id]));
    await como(() => db.query("update public.presupuestos set estado = 'rechazado' where id = $1", [p.id]));
    let ev = await db.query<{ estado: string }>("select estado from public.eventos where presupuesto_id = $1", [p.id]);
    expect(ev.rows[0].estado).toBe("cancelado");
    await como(() => db.query("select public.aceptar_presupuesto($1)", [p.id]));
    ev = await db.query<{ estado: string }>("select estado from public.eventos where presupuesto_id = $1", [p.id]);
    expect(ev.rows[0].estado).toBe("activo");
  });

  it("se puede aceptar un presupuesto sin tipo de evento (como los importados)", async () => {
    const p = await crear({ ...BASE, tipo_evento: null });
    await como(() => db.query("select public.aceptar_presupuesto($1)", [p.id]));
    const ev = await db.query<{ es_larga_duracion: boolean }>("select es_larga_duracion from public.eventos where presupuesto_id = $1", [p.id]);
    expect(ev.rows[0].es_larga_duracion).toBe(false);
  });

  it("aceptar marca el lead como Ganado", async () => {
    const lead = await como(async () => {
      const { rows } = await db.query<{ id: string }>(
        "insert into public.leads (cliente_nombre) values ('Familia Ortega') returning id");
      return rows[0].id;
    });
    const p = await crear({ ...BASE, lead_id: lead });
    await como(() => db.query("select public.marcar_enviado($1, 1)", [p.id]));
    let l = await db.query<{ estado: string }>("select estado from public.leads where id = $1", [lead]);
    expect(l.rows[0].estado).toBe("presupuesto_enviado");
    await como(() => db.query("select public.aceptar_presupuesto($1)", [p.id]));
    l = await db.query<{ estado: string }>("select estado from public.leads where id = $1", [lead]);
    expect(l.rows[0].estado).toBe("ganado");
  });
});

describe("estados de pago", () => {
  async function aceptadoCon(importe: number, reserva: number) {
    const p = await crear({ ...BASE, reserva_pct: reserva });
    await como(() => db.query("update public.presupuestos set importe = $2 where id = $1", [p.id, importe]));
    await como(() => db.query("select public.aceptar_presupuesto($1)", [p.id]));
    return p.id;
  }

  it("Aceptado → Reserva pagada → Pagado 100 % según lo cobrado", async () => {
    const id = await aceptadoCon(13246, 30);
    await cobrar(id, 1000);
    expect(await estado(id)).toBe("aceptado");
    await cobrar(id, 2973.8); // total 3.973,80 € = 30 %
    expect(await estado(id)).toBe("reserva_pagada");
    await cobrar(id, 9272.2);
    expect(await estado(id)).toBe("pagado");
  });

  it("borrar un cobro a la papelera vuelve a calcular el estado", async () => {
    const id = await aceptadoCon(1000, 30);
    const cobro = await como(async () => {
      const { rows } = await db.query<{ id: string }>(
        "insert into public.cobros (presupuesto_id, importe) values ($1, 1000) returning id", [id]);
      return rows[0].id;
    });
    expect(await estado(id)).toBe("pagado");
    await como(() => db.query("select public.papelera_mover('cobros', $1)", [cobro]));
    expect(await estado(id)).toBe("aceptado");
  });

  it("si sube el importe, deja de estar pagado", async () => {
    const id = await aceptadoCon(1000, 30);
    await cobrar(id, 1000);
    expect(await estado(id)).toBe("pagado");
    await como(() => db.query("update public.presupuestos set importe = 2000 where id = $1", [id]));
    expect(await estado(id)).toBe("reserva_pagada");
    const ev = await db.query<{ importe: string }>("select importe from public.eventos where presupuesto_id = $1", [id]);
    expect(Number(ev.rows[0].importe)).toBe(2000);
  });

  it("los cobros no cambian el estado de un presupuesto sin aceptar", async () => {
    const p = await crear(BASE);
    await cobrar(p.id, 500);
    expect(await estado(p.id)).toBe("borrador");
  });
});

describe("caducados", () => {
  it("Pendiente con fecha pasada → Caducado; reversible a mano y no se vuelve a caducar", async () => {
    const pasado = await crear({ ...BASE, fecha_evento: "2025-06-01" });
    const futuro = await crear({ ...BASE, fecha_evento: "2099-06-01" });
    const mesPasado = await crear({ ...BASE, fecha_precision: "mes", fecha_evento: "2025-06-01" });
    const porDefinir = await crear({ ...BASE, fecha_precision: "por_definir", fecha_evento: "" });
    for (const p of [pasado, futuro, mesPasado, porDefinir]) {
      await como(() => db.query("select public.marcar_enviado($1, 1)", [p.id]));
    }

    const r = await como(() => db.query<{ n: number }>("select public.marcar_caducados() as n"));
    expect(r.rows[0].n).toBe(2);
    expect(await estado(pasado.id)).toBe("caducado");
    expect(await estado(mesPasado.id)).toBe("caducado");
    expect(await estado(futuro.id)).toBe("pendiente");
    expect(await estado(porDefinir.id)).toBe("pendiente");

    await como(() => db.query("update public.presupuestos set estado = 'pendiente' where id = $1", [pasado.id]));
    await como(() => db.query("select public.marcar_caducados()"));
    expect(await estado(pasado.id)).toBe("pendiente");
  });
});
