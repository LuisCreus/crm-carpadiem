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

describe("refuerzos de seguridad", () => {
  it("nadie crea una factura ya emitida ni le cambia el estado a mano", async () => {
    await expect(como(jimena, () => db.query("insert into public.facturas (importe, estado, anio, numero) values (100, 'emitida', 2026, 50)")))
      .rejects.toThrow(/se crean por emitir/);
    const { rows } = await como(jimena, () => db.query<{ id: string }>("insert into public.facturas (importe) values (100) returning id"));
    await expect(como(jimena, () => db.query("update public.facturas set estado = 'pagada', fecha_pago = '2026-11-01' where id = $1", [rows[0].id])))
      .rejects.toThrow(/solo se cambian/);
    await como(jimena, () => db.query("update public.facturas set concepto = 'Bien' where id = $1", [rows[0].id]));
  });

  it("el número del presupuesto lo pone el contador (salvo el administrador)", async () => {
    const c = (await db.query<{ id: string }>("insert into public.clientes (nombre) values ('X') returning id")).rows[0].id;
    await expect(como(jimena, () => db.query("insert into public.presupuestos (cliente_id, anio, numero, fecha_precision) values ($1, 2026, 90, 'por_definir')", [c])))
      .rejects.toThrow(/lo pone el CRM/);
    const { rows } = await como(jimena, () => db.query<{ id: string }>("insert into public.presupuestos (cliente_id, fecha_precision) values ($1, 'por_definir') returning id", [c]));
    await expect(como(jimena, () => db.query("update public.presupuestos set numero = 90 where id = $1", [rows[0].id])))
      .rejects.toThrow(/no se puede cambiar/);
    await como(luis, () => db.query("update public.presupuestos set numero = 91 where id = $1", [rows[0].id]));
  });

  it("los movimientos del banco solo los borra el administrador", async () => {
    await db.query("insert into public.movimientos_banco (fecha, concepto, importe, huella) values ('2026-11-01', 'X', 10, 'h1')");
    const borrados = await como(jimena, () => db.query("delete from public.movimientos_banco returning id"));
    expect(borrados.rows).toHaveLength(0);
    expect((await como(luis, () => db.query("delete from public.movimientos_banco returning id"))).rows).toHaveLength(1);
  });

  it("solo se entra con Microsoft; «creado por» es siempre quien lo crea", async () => {
    await expect(db.query(`insert into auth.users (email, raw_app_meta_data) values ('x@carpa-diem.com', '{"provider": "email"}')`))
      .rejects.toThrow(/SOLO_MICROSOFT/);
    const { rows } = await como(jimena, () => db.query<{ created_by: string }>("insert into public.clientes (nombre, created_by) values ('Y', $1) returning created_by", [luis]));
    expect(rows[0].created_by).toBe(jimena);
  });
});
