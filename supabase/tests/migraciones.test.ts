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

async function crearCliente(userId: string, nombre = "Carlota Durán") {
  return comoUsuario(db, userId, async () => {
    const { rows } = await db.query<{ id: string }>(
      "insert into public.clientes (nombre) values ($1) returning id", [nombre]);
    return rows[0].id;
  });
}

async function crearPresupuesto(userId: string, clienteId: string) {
  return comoUsuario(db, userId, async () => {
    const { rows } = await db.query<{ anio: number; numero: number; codigo: string }>(
      "insert into public.presupuestos (cliente_id, fecha_precision) values ($1, 'por_definir') returning anio, numero, codigo",
      [clienteId]);
    return rows[0];
  });
}

describe("usuarios y dominios", () => {
  it("Luis entra como administrador y el resto como usuario", async () => {
    const { rows } = await db.query<{ email: string; rol: string }>("select email, rol from public.perfiles order by email");
    expect(rows).toEqual([
      { email: "jimena@carpa-diem.com", rol: "usuario" },
      { email: "lcreus@carpa-diem.com", rol: "admin" },
    ]);
  });

  it("rechaza cuentas de dominios no permitidos", async () => {
    await expect(crearUsuario(db, "alguien@gmail.com")).rejects.toThrow(/DOMINIO_NO_PERMITIDO/);
  });

  it("acepta un dominio nuevo cuando el administrador lo añade", async () => {
    await comoUsuario(db, luis, () =>
      db.query("update public.ajustes set dominios_permitidos = dominios_permitidos || '{grupogilca.com}'"));
    await expect(crearUsuario(db, "ana@grupogilca.com")).resolves.toBeTruthy();
  });

  it("un usuario normal no puede cambiar ajustes ni roles", async () => {
    await comoUsuario(db, jimena, async () => {
      const r1 = await db.query("update public.ajustes set dias_seguimiento = 1");
      expect(r1.affectedRows).toBe(0);
      const r2 = await db.query("update public.perfiles set rol = 'admin' where id = $1", [jimena]);
      expect(r2.affectedRows).toBe(0);
    });
  });

  it("un usuario desactivado deja de ver los datos", async () => {
    await crearCliente(jimena);
    await comoUsuario(db, luis, () => db.query("update public.perfiles set activo = false where id = $1", [jimena]));
    const { rows } = await comoUsuario(db, jimena, () => db.query("select id from public.clientes"));
    expect(rows).toHaveLength(0);
  });

  it("el administrador no puede quitarse a sí mismo el rol", async () => {
    await expect(
      comoUsuario(db, luis, () => db.query("update public.perfiles set rol = 'usuario' where id = $1", [luis])),
    ).rejects.toThrow(/No puedes quitarte/);
  });
});

describe("numeración de presupuestos", () => {
  it("empieza en el número inicial del año y sigue correlativo", async () => {
    const cliente = await crearCliente(jimena);
    const anio = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Europe/Madrid" }).format(new Date()));
    await db.query(
      "insert into public.numeracion_anual (anio, numero_inicial) values ($1, 13) on conflict (anio) do update set numero_inicial = 13",
      [anio]);
    const a = await crearPresupuesto(jimena, cliente);
    const b = await crearPresupuesto(luis, cliente);
    expect([a.anio, a.numero, b.numero]).toEqual([anio, 13, 14]);
    expect(a.codigo).toBe("CD 013");
  });

  it("2026 está configurado para empezar en el 13", async () => {
    const { rows } = await db.query<{ numero_inicial: number }>(
      "select numero_inicial from public.numeracion_anual where anio = 2026");
    expect(rows[0].numero_inicial).toBe(13);
  });

  it("respeta el número inicial configurado y continúa desde el último", async () => {
    await db.query("insert into public.numeracion_anual (anio, numero_inicial, ultimo_numero) values (2030, 50, 0)");
    const r1 = await db.query<{ n: number }>("select public.siguiente_numero_presupuesto(2030) as n");
    const r2 = await db.query<{ n: number }>("select public.siguiente_numero_presupuesto(2030) as n");
    expect([r1.rows[0].n, r2.rows[0].n]).toEqual([50, 51]);
  });

  it("si se sube el número inicial por encima del último, salta a él", async () => {
    await db.query("insert into public.numeracion_anual (anio, numero_inicial, ultimo_numero) values (2030, 1, 5)");
    await db.query("update public.numeracion_anual set numero_inicial = 20 where anio = 2030");
    const { rows } = await db.query<{ n: number }>("select public.siguiente_numero_presupuesto(2030) as n");
    expect(rows[0].n).toBe(20);
  });

  it("un año sin configurar empieza en el 1", async () => {
    const { rows } = await db.query<{ n: number }>("select public.siguiente_numero_presupuesto(2031) as n");
    expect(rows[0].n).toBe(1);
  });

  it("nunca repite número aunque se pidan muchos seguidos", async () => {
    const cliente = await crearCliente(jimena);
    const numeros: number[] = [];
    for (let i = 0; i < 25; i++) numeros.push((await crearPresupuesto(jimena, cliente)).numero);
    expect(new Set(numeros).size).toBe(25);
  });

  it("la base de datos impide dos presupuestos con el mismo año y número", async () => {
    const cliente = await crearCliente(jimena);
    const sql = "insert into public.presupuestos (anio, numero, cliente_id, fecha_precision) values (2026, 77, $1, 'por_definir')";
    await db.query(sql, [cliente]);
    await expect(db.query(sql, [cliente])).rejects.toThrow(/duplicate key|unique/);
  });

  it("un usuario no puede llamar directamente al contador", async () => {
    await expect(
      comoUsuario(db, jimena, () => db.query("select public.siguiente_numero_presupuesto(2026)")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("historial de cambios", () => {
  it("registra quién creó y quién cambió qué", async () => {
    const id = await crearCliente(jimena, "Elena Guinea");
    await comoUsuario(db, luis, () => db.query("update public.clientes set nombre = 'Elena Guinea Ruiz' where id = $1", [id]));

    const { rows } = await db.query<{ accion: string; usuario_email: string; cambios: Record<string, unknown> | null }>(
      "select accion, usuario_email, cambios from public.historial where tabla = 'clientes' and registro_id = $1 order by id", [id]);
    expect(rows.map((r) => [r.accion, r.usuario_email])).toEqual([
      ["crear", "jimena@carpa-diem.com"],
      ["editar", "lcreus@carpa-diem.com"],
    ]);
    expect(rows[1].cambios).toEqual({ nombre: { antes: "Elena Guinea", despues: "Elena Guinea Ruiz" } });
  });

  it("guarda quién creó y quién cambió en el propio registro", async () => {
    const id = await crearCliente(jimena);
    await comoUsuario(db, luis, () => db.query("update public.clientes set notas = 'x' where id = $1", [id]));
    const { rows } = await db.query<{ created_by: string; updated_by: string }>(
      "select created_by, updated_by from public.clientes where id = $1", [id]);
    expect(rows[0]).toEqual({ created_by: jimena, updated_by: luis });
  });

  it("los usuarios no pueden tocar el historial", async () => {
    await expect(comoUsuario(db, luis, () => db.query("delete from public.historial"))).rejects.toThrow(/permission denied/);
  });
});

describe("papelera", () => {
  it("un usuario borra a la papelera y deja de verlo; el admin lo ve y lo restaura", async () => {
    const id = await crearCliente(jimena);
    await comoUsuario(db, jimena, () => db.query("select public.papelera_mover('clientes', $1)", [id]));

    const visibleJimena = await comoUsuario(db, jimena, () => db.query("select id from public.clientes"));
    expect(visibleJimena.rows).toHaveLength(0);

    const papeleraAdmin = await comoUsuario(db, luis, () => db.query("select tabla, id from public.papelera"));
    expect(papeleraAdmin.rows).toEqual([{ tabla: "clientes", id }]);
    const papeleraJimena = await comoUsuario(db, jimena, () => db.query("select id from public.papelera"));
    expect(papeleraJimena.rows).toHaveLength(0);

    await comoUsuario(db, luis, () => db.query("select public.papelera_restaurar('clientes', $1)", [id]));
    const otraVez = await comoUsuario(db, jimena, () => db.query("select id from public.clientes"));
    expect(otraVez.rows).toHaveLength(1);

    const acciones = await db.query<{ accion: string }>(
      "select accion from public.historial where tabla = 'clientes' and registro_id = $1 order by id", [id]);
    expect(acciones.rows.map((r) => r.accion)).toEqual(["crear", "borrar", "restaurar"]);
  });

  it("solo el administrador restaura o borra definitivamente", async () => {
    const id = await crearCliente(jimena);
    await comoUsuario(db, jimena, () => db.query("select public.papelera_mover('clientes', $1)", [id]));
    await expect(comoUsuario(db, jimena, () => db.query("select public.papelera_restaurar('clientes', $1)", [id])))
      .rejects.toThrow(/Solo el administrador/);
    await expect(comoUsuario(db, jimena, () => db.query("select public.papelera_eliminar('clientes', $1)", [id])))
      .rejects.toThrow(/Solo el administrador/);
    const borrado = await comoUsuario(db, jimena, () => db.query("delete from public.clientes where id = $1", [id]));
    expect(borrado.affectedRows).toBe(0);

    await comoUsuario(db, luis, () => db.query("select public.papelera_eliminar('clientes', $1)", [id]));
    const { rows } = await db.query("select id from public.clientes where id = $1", [id]);
    expect(rows).toHaveLength(0);
  });

  it("no se puede mandar a la papelera editando a mano", async () => {
    const id = await crearCliente(jimena);
    await expect(
      comoUsuario(db, jimena, () => db.query("update public.clientes set deleted_at = now() where id = $1", [id])),
    ).rejects.toThrow(/row-level security/);
  });
});
