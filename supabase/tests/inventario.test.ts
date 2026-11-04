import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { comoUsuario, crearBaseDePrueba, crearUsuario } from "./pg-prueba";

let db: PGlite;
let luis: string;
let jimena: string;
beforeEach(async () => {
  db = await crearBaseDePrueba();
  luis = await crearUsuario(db, "lcreus@carpa-diem.com");
  jimena = await crearUsuario(db, "jimena@carpa-diem.com");
});

describe("inventario integrado", () => {
  it("el Excel está cargado: lo grande (3 beduinas, 4 modulares, 72 m² de tarima, 5 sombrillas) y los kits", async () => {
    const { rows } = await db.query<{ recurso: string; total: string }>(
      "select recurso, (cantidad * equivale)::text total from public.inventario where recurso is not null order by recurso");
    expect(rows.map((r) => [r.recurso, Number(r.total)])).toEqual([["beduinas", 3], ["modulares", 4], ["sombrillas", 5], ["tarima_m2", 72]]);
    const kit = await db.query<{ n: number }>("select count(*)::int n from public.kit_material");
    expect(kit.rows[0].n).toBe(26);
  });

  it("los kits los cambia solo el administrador; todos los ven", async () => {
    expect((await comoUsuario(db, jimena, () => db.query("select 1 from public.kit_material"))).rows).toHaveLength(26);
    const cambiado = await comoUsuario(db, jimena, () => db.query("update public.kit_material set por_unidad = 9 returning id"));
    expect(cambiado.rows).toHaveLength(0);
    expect((await comoUsuario(db, luis, () => db.query("update public.kit_material set por_unidad = 9 where recurso = 'sombrillas' returning id"))).rows).toHaveLength(1);
  });

  it("el presupuesto guarda las 4 cantidades", async () => {
    const c = (await db.query<{ id: string }>("insert into public.clientes (nombre) values ('X') returning id")).rows[0].id;
    const { rows } = await db.query<{ uds_beduinas: number; m2_tarima: string }>(
      "insert into public.presupuestos (cliente_id, fecha_precision, uds_beduinas, m2_tarima) values ($1, 'por_definir', 2, 72) returning uds_beduinas, m2_tarima::text", [c]);
    expect(rows[0]).toEqual({ uds_beduinas: 2, m2_tarima: "72.00" });
  });
});
