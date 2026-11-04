import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { comoUsuario, crearBaseDePrueba, crearUsuario } from "./pg-prueba";

let db: PGlite;
let socia: string;
beforeEach(async () => {
  db = await crearBaseDePrueba();
  await crearUsuario(db, "lcreus@carpa-diem.com");
  socia = await crearUsuario(db, "jimena@lamaraca.com");
});
const como = <T>(fn: () => Promise<T>) => comoUsuario(db, socia, fn);

describe("socios", () => {
  it("entran solo las direcciones de la lista (no todo su dominio)", async () => {
    const { rows } = await db.query<{ es_socio: boolean; rol: string }>("select es_socio, rol from public.perfiles where id = $1", [socia]);
    expect(rows[0]).toEqual({ es_socio: true, rol: "usuario" });
    await expect(crearUsuario(db, "otra@lamaraca.com")).rejects.toThrow(/DOMINIO_NO_PERMITIDO/);
  });

  it("ven las facturas y las finanzas, pero no las cambian; el resto sí", async () => {
    await db.query("insert into public.facturas (importe) values (100)");
    expect((await como(() => db.query("select 1 from public.facturas"))).rows).toHaveLength(1);
    expect((await como(() => db.query("select 1 from public.activos"))).rows.length).toBeGreaterThan(0);
    await expect(como(() => db.query("insert into public.facturas (importe) values (50)"))).rejects.toThrow(/SOLO_LECTURA/);
    await expect(como(() => db.query("update public.facturas set concepto = 'x'"))).rejects.toThrow(/SOLO_LECTURA/);
    await como(() => db.query("insert into public.clientes (nombre) values ('Cliente de la socia')"));
  });
});
