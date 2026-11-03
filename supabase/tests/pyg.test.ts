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

const como = <T>(quien: string, fn: () => Promise<T>) => comoUsuario(db, quien, fn);
const activosDe = async (factura: string) =>
  (await db.query<{ coste: string; vida_anios: number }>("select coste::text, vida_anios from public.activos where factura_recibida_id = $1", [factura])).rows;

describe("P&L: CAPEX y datos a mano", () => {
  it("el CAPEX del Excel está cargado; el sueldo del director no va a mano (sale de Maketa)", async () => {
    const a = await db.query<{ n: number; total: string }>("select count(*)::int n, sum(coste)::text total from public.activos");
    expect(a.rows[0]).toEqual({ n: 9, total: "52142.41" });
    const d = await db.query<{ n: number }>("select count(*)::int n from public.pyg_manual where concepto = 'director' and importe = 1100");
    expect(d.rows[0].n).toBe(0);
  });

  it("una factura de material de carpas entra sola en el CAPEX y sale si cambia de categoría o va a la papelera", async () => {
    const { rows } = await como(jimena, () => db.query<{ id: string }>(
      "insert into public.facturas_recibidas (base, categoria, fecha, concepto) values (350, 'material_carpas', '2026-10-06', 'Lonas 6x6') returning id"));
    const id = rows[0].id;
    expect(await activosDe(id)).toEqual([{ coste: "350.00", vida_anios: 10 }]);

    await como(jimena, () => db.query("update public.facturas_recibidas set base = 400 where id = $1", [id]));
    expect((await activosDe(id))[0].coste).toBe("400.00");

    await como(jimena, () => db.query("update public.facturas_recibidas set categoria = 'otros' where id = $1", [id]));
    expect(await activosDe(id)).toEqual([]);

    await como(jimena, () => db.query("update public.facturas_recibidas set categoria = 'material_carpas' where id = $1", [id]));
    await como(jimena, () => db.query("select public.papelera_mover('facturas_recibidas', $1)", [id]));
    expect(await activosDe(id)).toEqual([]);
  });

  it("solo el administrador lo ve y lo cambia", async () => {
    expect((await como(jimena, () => db.query("select 1 from public.activos"))).rows).toHaveLength(0);
    expect((await como(luis, () => db.query("select 1 from public.activos"))).rows).toHaveLength(9);
    await expect(como(jimena, () => db.query("insert into public.pyg_manual (mes, concepto, importe) values ('2026-10-01', 'bonus', 500)")))
      .rejects.toThrow(/row-level security/);
    await como(luis, () => db.query("insert into public.pyg_manual (mes, concepto, importe) values ('2026-10-01', 'bonus', 500)"));
    const editado = await como(jimena, () => db.query("update public.activos set vida_anios = 3 returning id"));
    expect(editado.rows).toHaveLength(0);
  });
});
