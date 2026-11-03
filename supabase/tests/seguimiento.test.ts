import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBaseDePrueba, crearUsuario } from "./pg-prueba";

let db: PGlite;
beforeEach(async () => {
  db = await crearBaseDePrueba();
  await crearUsuario(db, "lcreus@carpa-diem.com");
});

const desde = async (id: string) => (await db.query<{ s: string | null }>("select seguimiento_desde::text s from public.presupuestos where id = $1", [id])).rows[0].s;

describe("seguimiento de presupuestos", () => {
  it("se apunta al crear y se renueva al cambiar de estado; los antiguos (sin fecha) no se tocan", async () => {
    const c = (await db.query<{ id: string }>("insert into public.clientes (nombre) values ('Ortega') returning id")).rows[0].id;
    const { rows } = await db.query<{ id: string }>("insert into public.presupuestos (cliente_id, anio, numero, fecha_precision) values ($1, 2026, 900, 'por_definir') returning id", [c]);
    const id = rows[0].id;
    expect(await desde(id)).not.toBeNull();

    await db.query("update public.presupuestos set seguimiento_desde = '2026-01-01' where id = $1", [id]);
    await db.query("update public.presupuestos set material = 'x' where id = $1", [id]);
    expect(await desde(id)).toMatch(/^2026-01-01/);
    await db.query("update public.presupuestos set estado = 'pendiente' where id = $1", [id]);
    expect(await desde(id)).not.toMatch(/^2026-01-01/);

    await db.query("update public.presupuestos set seguimiento_desde = null where id = $1", [id]);
    await db.query("update public.presupuestos set estado = 'rechazado' where id = $1", [id]);
    expect(await desde(id)).toBeNull();
  });
});
