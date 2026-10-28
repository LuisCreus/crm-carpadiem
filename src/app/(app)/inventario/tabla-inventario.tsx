"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Cabecera } from "@/components/cabecera";
import { claseSelect } from "@/components/campo";
import { EstadoVacio } from "@/components/estado-vacio";
import { HistorialDialogo } from "@/components/historial-dialogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { moverAPapelera } from "@/lib/datos/papelera";
import { uno } from "@/lib/datos/tipos";
import { formatoFecha } from "@/lib/formato";
import { rangoOcupacion, solapesMaterial, type EventoOcupacion, type Solape } from "@/lib/operativa";

type Item = { id: string; material: string; cantidad: number; unidad: string; propiedad: "propio" | "subalquilado"; notas: string | null };
type Datos = { items: Item[]; solapes: Solape[] };

export function TablaInventario() {
  const sb = crearClienteNavegador();
  const { datos, cargando } = useTablaEnVivo<Datos>(["inventario", "evento_material", "eventos"], async (s) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const [inv, res, ev] = await Promise.all([
      s.from("inventario").select("id, material, cantidad, unidad, propiedad, notas").is("deleted_at", null).order("material"),
      s.from("evento_material").select("evento_id, inventario_id, cantidad"),
      s.from("eventos").select("id, fecha_precision, fecha_inicio, fecha_fin, montaje_inicio, desmontaje_inicio, desmontaje_fin, cliente:clientes(nombre)")
        .eq("estado", "activo").is("deleted_at", null),
    ]);
    const items = ((inv.data ?? []) as Item[]).map((i) => ({ ...i, cantidad: Number(i.cantidad) }));
    const ocupacion: EventoOcupacion[] = (ev.data ?? []).flatMap((e) => {
      const rango = rangoOcupacion(e);
      const material = (res.data ?? []).filter((r) => r.evento_id === e.id).map((r) => ({ inventarioId: r.inventario_id as string, cantidad: Number(r.cantidad) }));
      return rango && material.length ? [{ id: e.id as string, nombre: uno(e.cliente)?.nombre ?? "Evento", ...rango, material }] : [];
    });
    return [{ items, solapes: solapesMaterial(ocupacion, items).filter((x) => x.hasta >= hoy) }];
  });
  const { items = [], solapes = [] } = datos[0] ?? {};

  const [nuevo, setNuevo] = useState({ material: "", cantidad: "", unidad: "ud", propiedad: "propio" as Item["propiedad"] });

  async function anadir(e: FormEvent) {
    e.preventDefault();
    if (!nuevo.material.trim()) return;
    const { error } = await sb.from("inventario").insert({
      material: nuevo.material.trim(), cantidad: Number(nuevo.cantidad) || 0, unidad: nuevo.unidad.trim() || "ud", propiedad: nuevo.propiedad,
    });
    if (error) return toast.error(error.message.includes("duplicate") ? "Ese material ya está en el inventario" : error.message);
    toast.success("Añadido ✓");
    setNuevo({ ...nuevo, material: "", cantidad: "" });
  }

  async function cambiar(item: Item, campo: keyof Item, valor: string) {
    const v = campo === "cantidad" ? Number(valor) || 0 : valor;
    if (item[campo] === v) return;
    const { error } = await sb.from("inventario").update({ [campo]: v }).eq("id", item.id);
    if (error) toast.error(error.message);
    else toast.success("Guardado ✓");
  }

  return (
    <>
      <Cabecera titulo="Inventario" subtitulo="Material propio y subalquilado. Reserva material en cada evento para que el CRM avise de los solapes." />

      {solapes.length > 0 && (
        <section className="mb-6 rounded-xl border border-[#F4B8B5] bg-[#FDEDEC] p-4">
          <h2 className="mb-2 text-sm font-semibold text-[#8C2420]">Falta material en estas fechas</h2>
          <ul className="grid gap-1.5 text-[13px] text-[#8C2420]">
            {solapes.map((s, i) => (
              <li key={i}>
                <b className="font-semibold">{s.material}</b>: se piden {s.pedido} y hay {s.disponible} del {formatoFecha(s.desde)} al {formatoFecha(s.hasta)} ·{" "}
                {s.eventoIds.map((id, j) => (
                  <span key={id}>{j > 0 && ", "}<Link href={`/eventos/${id}`} className="text-[#8C2420] underline">{s.eventos[j]}</Link></span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!cargando && items.length === 0 && (
        <EstadoVacio titulo="El inventario está vacío" texto="Añade aquí cada material con su cantidad: beduinas, modulares, tarima, picas, guirnaldas…" />
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2.5 font-medium">Material</th>
              <th className="px-3 py-2.5 font-medium">Cantidad</th>
              <th className="px-3 py-2.5 font-medium">Unidad</th>
              <th className="px-3 py-2.5 font-medium">Propiedad</th>
              <th className="px-3 py-2.5 font-medium">Notas</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b last:border-0">
                <td className="px-4 py-1.5">
                  <Input aria-label="Material" defaultValue={i.material} className="h-8 border-transparent bg-transparent hover:border-input"
                    onBlur={(e) => cambiar(i, "material", e.target.value.trim())} />
                </td>
                <td className="px-3 py-1.5">
                  <Input aria-label="Cantidad" type="number" min={0} defaultValue={i.cantidad} className="h-8 w-24"
                    onBlur={(e) => cambiar(i, "cantidad", e.target.value)} />
                </td>
                <td className="px-3 py-1.5">
                  <Input aria-label="Unidad" defaultValue={i.unidad} className="h-8 w-20" onBlur={(e) => cambiar(i, "unidad", e.target.value.trim())} />
                </td>
                <td className="px-3 py-1.5">
                  <select aria-label="Propiedad" className={`${claseSelect} w-36`} defaultValue={i.propiedad} onChange={(e) => cambiar(i, "propiedad", e.target.value)}>
                    <option value="propio">Propio</option>
                    <option value="subalquilado">Subalquilado</option>
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <Input aria-label="Notas" defaultValue={i.notas ?? ""} className="h-8" onBlur={(e) => cambiar(i, "notas", e.target.value)} />
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <HistorialDialogo tabla="inventario" registroId={i.id} titulo={i.material} />
                  <Button variant="ghost" size="icon" aria-label={`Borrar ${i.material}`}
                    onClick={() => moverAPapelera("inventario", i.id).then(() => toast.success("Movido a la papelera")).catch((e) => toast.error(e.message))}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
            <tr className="bg-muted/40">
              <td colSpan={6} className="px-4 py-3">
                <form onSubmit={anadir} className="flex flex-wrap gap-2">
                  <Input aria-label="Nuevo material" placeholder="Nuevo material (p. ej. Beduina 12x15)" className="min-w-56 flex-1 bg-card"
                    value={nuevo.material} onChange={(e) => setNuevo({ ...nuevo, material: e.target.value })} />
                  <Input aria-label="Cantidad" type="number" min={0} placeholder="Cant." className="w-24 bg-card"
                    value={nuevo.cantidad} onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })} />
                  <Input aria-label="Unidad" className="w-20 bg-card" value={nuevo.unidad} onChange={(e) => setNuevo({ ...nuevo, unidad: e.target.value })} />
                  <select aria-label="Propiedad" className={`${claseSelect} w-36 bg-card`} value={nuevo.propiedad}
                    onChange={(e) => setNuevo({ ...nuevo, propiedad: e.target.value as Item["propiedad"] })}>
                    <option value="propio">Propio</option>
                    <option value="subalquilado">Subalquilado</option>
                  </select>
                  <Button type="submit">Añadir</Button>
                </form>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
