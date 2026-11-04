"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronDown, Trash2 } from "lucide-react";
import { Cabecera } from "@/components/cabecera";
import { cn } from "@/lib/utils";
import { claseSelect } from "@/components/campo";
import { EstadoVacio } from "@/components/estado-vacio";
import { HistorialDialogo } from "@/components/historial-dialogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEsAdmin } from "@/components/usuario";
import { rango, useDisponibilidad } from "@/hooks/use-disponibilidad";
import { useKit } from "@/hooks/use-kit";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { moverAPapelera } from "@/lib/datos/papelera";
import { textoFalta } from "@/lib/disponibilidad";
import { formatoFecha, hoyMadrid } from "@/lib/formato";
import { piezasParaMontar, RECURSOS, textoCantidades, type Recurso } from "@/lib/material";
import { sumarDias } from "@/lib/operativa";

type Item = {
  id: string; material: string; cantidad: number; unidad: string; propiedad: "propio" | "subalquilado"; notas: string | null;
  grupo: string | null; orden: number; recurso: Recurso | null; equivale: number;
};
const GRUPOS: [string, Recurso, string][] = [
  ["Carpas beduinas", "beduinas", "cada beduina"], ["Carpas modulares", "modulares", "cada modular"],
  ["Tarima", "tarima_m2", "cada m² de tarima"], ["Sombrillas", "sombrillas", "cada sombrilla"],
];
const decimal = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

// Inventario: lo grande (para el aviso de disponibilidad), las piezas de cada carpa y lo que hay que preparar
export function TablaInventario() {
  const sb = crearClienteNavegador();
  const esAdmin = useEsAdmin();
  const kit = useKit();
  const disponible = useDisponibilidad();
  const hoy = hoyMadrid();
  const { datos, cargando } = useTablaEnVivo<Item>(["inventario"], async (s) => {
    const { data, error } = await s.from("inventario").select("id, material, cantidad, unidad, propiedad, notas, grupo, orden, recurso, equivale")
      .is("deleted_at", null).order("orden").order("material");
    if (error) throw new Error(error.message);
    return ((data ?? []) as Item[]).map((i) => ({ ...i, cantidad: Number(i.cantidad), equivale: Number(i.equivale) }));
  });
  const grupos = useMemo(() => {
    const nombres = [...new Set([...GRUPOS.map((g) => g[0]), ...datos.map((i) => i.grupo ?? "Otros")])];
    return nombres.map((g) => ({ nombre: g, items: datos.filter((i) => (i.grupo ?? "Otros") === g) })).filter((g) => g.items.length);
  }, [datos]);
  const faltas = disponible.faltasConfirmadas.filter((f) => f.hasta >= hoy);

  const [nuevo, setNuevo] = useState({ material: "", cantidad: "", unidad: "ud", grupo: "Carpas beduinas" });
  async function anadir(e: FormEvent) {
    e.preventDefault();
    if (!nuevo.material.trim()) return;
    const { error } = await sb.from("inventario").insert({
      material: nuevo.material.trim(), cantidad: Number(nuevo.cantidad) || 0, unidad: nuevo.unidad.trim() || "ud", grupo: nuevo.grupo || null,
      orden: Math.max(0, ...datos.filter((i) => i.grupo === nuevo.grupo).map((i) => i.orden)) + 1,
    });
    if (error) return toast.error(error.message.includes("duplicate") ? "Ese material ya está en el inventario" : error.message);
    toast.success("Añadido ✓");
    setNuevo({ ...nuevo, material: "", cantidad: "" });
  }
  async function cambiar(item: Item, campo: keyof Item, valor: string) {
    const v = campo === "cantidad" ? Number(valor) || 0 : valor;
    if (item[campo] === v) return;
    const { error } = await sb.from("inventario").update({ [campo]: v }).eq("id", item.id);
    if (error) toast.error(error.message); else toast.success("Guardado ✓");
  }
  // Cuántas piezas de este material lleva cada carpa (0 = no va en el kit)
  async function cambiarKit(item: Item, recurso: Recurso, texto: string) {
    const v = Number(texto.replace(",", ".")) || 0;
    const actual = kit.find((k) => k.inventarioId === item.id && k.recurso === recurso)?.porUnidad ?? 0;
    if (Math.abs(v - actual) < 0.0001) return;
    const { error } = v > 0
      ? await sb.from("kit_material").upsert({ recurso, inventario_id: item.id, por_unidad: v }, { onConflict: "recurso,inventario_id" })
      : await sb.from("kit_material").delete().eq("recurso", recurso).eq("inventario_id", item.id);
    if (error) toast.error(error.message); else toast.success("Kit guardado ✓");
  }

  // Próximos 30 días: qué hay que preparar para cada montaje
  const proximos = disponible.confirmados.filter((c) => c.hasta >= hoy && c.desde <= sumarDias(hoy, 30)).sort((a, b) => a.desde.localeCompare(b.desde));

  return (
    <>
      <Cabecera titulo="Inventario" subtitulo="Todo el material. Las carpas, la tarima y las sombrillas cuentan para avisar si un día no hay suficiente." />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        {RECURSOS.map((r) => (
          <div key={r.clave} className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">{r.nombre}</div>
            <div className="text-xl font-semibold">{decimal(disponible.capacidad[r.clave])} {r.unidad === "m²" ? "m²" : ""}</div>
            <div className="text-xs text-muted-foreground">disponibles</div>
          </div>
        ))}
      </div>

      {faltas.length > 0 && (
        <section className="mb-6 rounded-xl border border-[#F4B8B5] bg-[#FDEDEC] p-4">
          <h2 className="mb-2 text-sm font-semibold text-[#8C2420]">⚠ Falta material en lo ya confirmado</h2>
          <ul className="grid gap-1.5 text-[13px] text-[#8C2420]">
            {faltas.map((f) => (
              <li key={`${f.recurso}${f.desde}`}>
                {textoFalta(f)} {rango(f)} ·{" "}
                {f.ids.map((id, j) => <span key={id}>{j > 0 && ", "}<Link href={`/eventos/${id}`} className="text-[#8C2420] underline">{f.nombres[j]}</Link></span>)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <PrepararMaterial proximos={proximos} kit={kit} />

      {!cargando && datos.length === 0 && <EstadoVacio titulo="El inventario está vacío" texto="Añade aquí cada material con su cantidad." />}

      {grupos.map((g) => {
        const def = GRUPOS.find((x) => x[0] === g.nombre);
        return (
          <section key={g.nombre} className="mb-5">
            <h2 className="mb-2 text-sm font-semibold">{g.nombre}</h2>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2 font-medium">Material</th>
                    <th className="px-3 py-2 font-medium">Hay</th>
                    {def && <th className="px-3 py-2 font-medium">Lleva {def[2]}</th>}
                    <th className="px-3 py-2 font-medium">Notas</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((i) => {
                    const porUnidad = def ? kit.find((k) => k.inventarioId === i.id && k.recurso === def[1])?.porUnidad ?? 0 : 0;
                    return (
                      <tr key={i.id} className={cn("border-b last:border-0", i.recurso && "bg-[#F7FAF8]")}>
                        <td className="px-4 py-1.5">
                          <Input aria-label="Material" defaultValue={i.material} className="h-8 border-transparent bg-transparent hover:border-input"
                            onBlur={(e) => cambiar(i, "material", e.target.value.trim())} />
                          {i.recurso && <span className="ml-3 text-[11px] text-[#25683D]">cuenta para el aviso{i.equivale !== 1 ? ` (1 = ${decimal(i.equivale)} m²)` : ""}</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          <Input aria-label="Cantidad" type="number" min={0} defaultValue={i.cantidad} className="h-8 w-20" onBlur={(e) => cambiar(i, "cantidad", e.target.value)} />
                        </td>
                        {def && (
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            <Input aria-label={`Lleva ${def[2]}`} inputMode="decimal" defaultValue={porUnidad ? decimal(porUnidad) : ""} placeholder="—" disabled={!esAdmin}
                              className="inline-flex h-8 w-20" onBlur={(e) => void cambiarKit(i, def[1], e.target.value)} />
                            {porUnidad > 0 && porUnidad % 1 !== 0 && <span className="ml-2 text-xs text-muted-foreground">se redondea hacia arriba</span>}
                          </td>
                        )}
                        <td className="px-3 py-1.5">
                          <Input aria-label="Notas" defaultValue={i.notas ?? ""} className="h-8" onBlur={(e) => cambiar(i, "notas", e.target.value)} />
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <HistorialDialogo tabla="inventario" registroId={i.id} titulo={i.material} />
                          {!i.recurso && (
                            <Button variant="ghost" size="icon" aria-label={`Borrar ${i.material}`}
                              onClick={() => moverAPapelera("inventario", i.id).then(() => toast.success("Movido a la papelera")).catch((e) => toast.error(e.message))}>
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <form onSubmit={anadir} className="flex flex-wrap gap-2 rounded-xl border bg-muted/40 p-3">
        <Input aria-label="Nuevo material" placeholder="Nuevo material (p. ej. Piquetas)" className="min-w-56 flex-1 bg-card"
          value={nuevo.material} onChange={(e) => setNuevo({ ...nuevo, material: e.target.value })} />
        <Input aria-label="Cantidad" type="number" min={0} placeholder="Cant." className="w-24 bg-card" value={nuevo.cantidad} onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })} />
        <select aria-label="Grupo" className={cn(claseSelect, "h-9 w-auto bg-card")} value={nuevo.grupo} onChange={(e) => setNuevo({ ...nuevo, grupo: e.target.value })}>
          {[...GRUPOS.map((x) => x[0]), "Otros"].map((x) => <option key={x} value={x === "Otros" ? "" : x}>{x}</option>)}
        </select>
        <Button type="submit">Añadir</Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">
        «Lleva cada…» es lo que sale en la hoja de montaje: por ejemplo, si cada beduina lleva 8 postes de 3 m, para 2 beduinas salen 16.
        {!esAdmin && " Solo el administrador cambia el kit."}
      </p>
    </>
  );
}

// Lista para el almacén: lo que hay que preparar para los montajes de los próximos 30 días
function PrepararMaterial({ proximos, kit }: { proximos: { id: string; nombre: string; desde: string; hasta: string; cantidades: Parameters<typeof piezasParaMontar>[0] }[]; kit: ReturnType<typeof useKit> }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  if (!proximos.length) return null;
  return (
    <section className="mb-6 rounded-xl border bg-card">
      <h2 className="px-4 pt-3 text-sm font-semibold">Preparar material · próximos 30 días</h2>
      <ul className="divide-y">
        {proximos.map((p) => {
          const piezas = piezasParaMontar(p.cantidades, kit);
          return (
            <li key={p.id}>
              <button type="button" onClick={() => setAbierto(abierto === p.id ? null : p.id)} aria-expanded={abierto === p.id}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-muted/40">
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", abierto !== p.id && "-rotate-90")} aria-hidden />
                <span className="flex-1"><b className="font-medium">{p.nombre}</b> <span className="text-muted-foreground">· sale el {formatoFecha(p.desde)} · {textoCantidades(p.cantidades)}</span></span>
                <Link href={`/eventos/${p.id}`} className="text-xs" onClick={(e) => e.stopPropagation()}>Abrir evento</Link>
              </button>
              {abierto === p.id && (
                <ul className="grid gap-0.5 px-11 pb-3 text-[13px] sm:grid-cols-2">
                  {piezas.length === 0 && <li className="text-muted-foreground">No hay kit para este material.</li>}
                  {piezas.map((x) => (
                    <li key={x.material} className="flex gap-2">
                      <span className="w-10 text-right font-medium tabular-nums">{x.cantidad}</span>
                      <span className="flex-1">{x.material}</span>
                      {x.falta > 0 && <span className="text-[#B0302A]">faltan {x.falta}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
