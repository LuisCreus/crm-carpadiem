// Prueba la importación generada por scripts/importacion/generar-sql.mjs en un Postgres en memoria.
// Solo se ejecuta si se indica el archivo:  IMPORTACION_SQL=<ruta.sql> npx vitest run importacion
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { comoUsuario, crearBaseDePrueba, crearUsuario } from "./pg-prueba";

const archivo = process.env.IMPORTACION_SQL;

describe.skipIf(!archivo)("importación de prueba", () => {
  it("se aplica entera y deja los estados revisados", async () => {
    const db = await crearBaseDePrueba();
    const luis = await crearUsuario(db, "lcreus@carpa-diem.com");
    // Dos veces: la segunda vacía lo anterior (como al pasar de las pruebas a producción)
    await db.exec(readFileSync(archivo!, "utf8"));
    await db.exec(readFileSync(archivo!, "utf8"));
    const q = async (s: string) => (await db.query(s)).rows;
    console.log("Estados:", await q("select estado, count(*)::int n from public.presupuestos group by 1 order by 2 desc"));
    console.log("Eventos:", await q("select modalidad, estado, count(*)::int n from public.eventos group by 1,2"));
    console.log("Pagos:", await q("select p.codigo, p.estado, p.importe::float, (select sum(importe)::float from public.cobros c where c.presupuesto_id = p.id) cobrado from public.presupuestos p where p.importe is not null order by numero"));
    console.log("Numeración:", await q("select anio, numero_inicial, ultimo_numero from public.numeracion_anual"));
    console.log("Intermediarios:", await q("select i.nombre, i.email is not null as tiene_email, count(p.id)::int presupuestos from public.intermediarios i left join public.presupuestos p on p.intermediario_id = i.id group by 1,2 order by 3 desc"));
    const n = await q("select count(*)::int n from public.presupuestos");
    expect(n[0]).toEqual({ n: 65 });
    const enlaces = await q("select count(sp_carpeta_id)::int carpetas, count(*) filter (where enviado_at is not null)::int enviados from public.presupuestos");
    console.log("Enlaces:", enlaces, await q("select count(docx_item_id)::int word, count(pdf_item_id)::int pdf from public.presupuesto_versiones"));
    console.log("Rechazados:", await q("select codigo, motivo_rechazo from public.presupuestos where estado = 'rechazado' order by numero"));
    expect((enlaces[0] as { enviados: number }).enviados).toBe(0);

    // Facturas del Excel contable (si se indica el archivo)
    if (process.env.FACTURAS_SQL) {
      await db.exec(readFileSync(process.env.FACTURAS_SQL, "utf8"));
      console.log("Facturas:", await q("select estado, count(*)::int n, sum(importe)::float total from public.facturas group by 1 order by 1"));
      console.log("Sin cobro enlazado:", await q("select codigo from public.facturas where estado = 'pagada' and cobro_id is null order by numero"));
      console.log("Por facturar:", await q(`select p.codigo, e.importe::float total, f.tipo, f.importe::float from public.facturas f
        join public.eventos e on e.id = f.evento_id left join public.presupuestos p on p.id = e.presupuesto_id
        where f.estado = 'prevista' order by p.numero`));
      console.log("Numeración:", await q("select * from public.numeracion_facturas"));
    }

    // Después de importar se pueden aceptar y cambiar de estado
    const pendientes = (await q("select id from public.presupuestos where estado = 'pendiente' order by numero")) as { id: string }[];
    for (const p of pendientes) await comoUsuario(db, luis, () => db.query("select public.aceptar_presupuesto($1)", [p.id]));
    const caducado = (await q("select id from public.presupuestos where estado = 'caducado' limit 1")) as { id: string }[];
    await comoUsuario(db, luis, () => db.query("update public.presupuestos set estado = 'rechazado' where id = $1", [caducado[0].id]));
  });
});
