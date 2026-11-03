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

describe("facturas recibidas", () => {
  it("total con IVA y retención de IRPF (autónomos)", async () => {
    const { rows } = await como(() => db.query<{ total: string }>(
      `with p as (insert into public.proveedores (nombre, nif, iban) values ('David Mendoza', '12345678Z', 'ES00 1234') returning id)
       insert into public.facturas_recibidas (proveedor_id, numero, base, iva_pct, irpf_pct, categoria)
       select id, '7', 1000, 21, 15, 'montadores' from p returning total::text`));
    expect(rows[0].total).toBe("1060.00");
  });

  it("pagada necesita fecha de pago", async () => {
    await expect(como(() => db.query("insert into public.facturas_recibidas (base, estado) values (100, 'pagada')")))
      .rejects.toThrow(/check/);
  });

  it("cualquier usuario la manda a la papelera; solo el administrador la borra del todo", async () => {
    const { rows } = await como(() => db.query<{ id: string }>("insert into public.facturas_recibidas (base) values (100) returning id"));
    await como(() => db.query("select public.papelera_mover('facturas_recibidas', $1)", [rows[0].id]));
    const visibles = await como(() => db.query("select 1 from public.facturas_recibidas"));
    expect(visibles.rows).toHaveLength(0);
  });

  it("las categorías del Excel están cargadas", async () => {
    const { rows } = await db.query<{ n: number }>("select count(*)::int n from public.categorias_gasto where tipo = 'variable'");
    expect(rows[0].n).toBe(8);
  });
});
