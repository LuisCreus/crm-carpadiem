// Prueba la importación generada por scripts/importacion/generar-sql.mjs en un Postgres en memoria.
// Solo se ejecuta si se indica el archivo:  IMPORTACION_SQL=<ruta.sql> npx vitest run importacion
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { crearBaseDePrueba, crearUsuario } from "./pg-prueba";

const archivo = process.env.IMPORTACION_SQL;

describe.skipIf(!archivo)("importación de prueba", () => {
  it("se aplica entera y deja los estados revisados", async () => {
    const db = await crearBaseDePrueba();
    await crearUsuario(db, "lcreus@carpa-diem.com");
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
  });
});
