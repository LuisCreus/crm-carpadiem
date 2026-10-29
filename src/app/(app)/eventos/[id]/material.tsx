"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { claseSelect } from "@/components/campo";
import { Etiqueta } from "@/components/etiqueta-estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { moverAPapelera } from "@/lib/datos/papelera";
import { formatoFecha, hoyMadrid } from "@/lib/formato";
import { controlMaterial, type EstadoMaterial, type Solape } from "@/lib/operativa";

export type MovimientoMaterial = { id: string; material: string; cantidad: number; sentido: "sale" | "entra"; fecha: string | null; notas: string | null };
export type ReservaMaterial = { id: string; inventario_id: string; cantidad: number };
export type ItemInventario = { id: string; material: string; cantidad: number; unidad: string };

const ESTADO: Record<EstadoMaterial, { texto: string; clase: string }> = {
  ok: { texto: "OK", clase: "bg-[#E8F4EC] text-[#25683D]" },
  faltan: { texto: "FALTAN", clase: "bg-[#FDEDEC] text-[#B0302A]" },
  sobran: { texto: "SOBRAN", clase: "bg-[#FDF3E1] text-[#8A5A0B]" },
  pendiente: { texto: "Fuera", clase: "bg-[#F2F1EE] text-[#6B6A66]" },
};

const hoy = () => hoyMadrid();

// Material reservado del inventario (para avisar si no llega)
export function TarjetaMaterialReservado({ eventoId, reservas, inventario, solapes }: {
  eventoId: string; reservas: ReservaMaterial[]; inventario: ItemInventario[]; solapes: Solape[];
}) {
  const sb = crearClienteNavegador();
  const [item, setItem] = useState("");
  const [cantidad, setCantidad] = useState("1");

  async function anadir(e: FormEvent) {
    e.preventDefault();
    if (!item || !(Number(cantidad) > 0)) return;
    const { error } = await sb.from("evento_material")
      .upsert({ evento_id: eventoId, inventario_id: item, cantidad: Number(cantidad) }, { onConflict: "evento_id,inventario_id" });
    if (error) return toast.error(error.message);
    setItem("");
    setCantidad("1");
  }

  async function quitar(id: string) {
    const { error } = await sb.from("evento_material").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  const nombre = (id: string) => inventario.find((i) => i.id === id);

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-1 text-[15px] font-semibold">Material reservado</h2>
      <p className="mb-3 text-[13px] text-muted-foreground">Del inventario. Sirve para avisar si otro evento en las mismas fechas necesita lo mismo.</p>
      {solapes.length > 0 && (
        <ul className="mb-3 grid gap-1.5">
          {solapes.map((s, i) => (
            <li key={i} role="alert" className="rounded-lg bg-[#FDEDEC] px-3 py-2 text-[13px] text-[#8C2420]">
              <b className="font-semibold">{s.material}:</b> se piden {s.pedido} y hay {s.disponible} del {formatoFecha(s.desde)} al {formatoFecha(s.hasta)} ({s.eventos.join(", ")})
            </li>
          ))}
        </ul>
      )}
      {inventario.length === 0 && <p className="text-sm text-muted-foreground">Carga primero el inventario (menú Inventario).</p>}
      <ul>
        {reservas.map((r) => (
          <li key={r.id} className="flex items-center gap-3 border-t py-2 text-sm first:border-0">
            <span className="flex-1">{nombre(r.inventario_id)?.material ?? "—"}</span>
            <span>{r.cantidad} {nombre(r.inventario_id)?.unidad}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => quitar(r.id)}><Trash2 className="size-3.5" aria-hidden /></Button>
          </li>
        ))}
      </ul>
      {inventario.length > 0 && (
        <form onSubmit={anadir} className="mt-3 flex gap-2">
          <select aria-label="Material" className={claseSelect} value={item} onChange={(e) => setItem(e.target.value)}>
            <option value="">Añadir material…</option>
            {inventario.map((i) => <option key={i.id} value={i.id}>{i.material} ({i.cantidad} {i.unidad})</option>)}
          </select>
          <Input aria-label="Cantidad" type="number" min={0.5} step="0.5" className="w-20" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          <Button type="submit" variant="outline">Añadir</Button>
        </form>
      )}
    </section>
  );
}

// Control de lo que sale y lo que vuelve: OK / FALTAN / SOBRAN
export function TarjetaControlMaterial({ eventoId, movimientos, inventario }: {
  eventoId: string; movimientos: MovimientoMaterial[]; inventario: ItemInventario[];
}) {
  const sb = crearClienteNavegador();
  const [nuevo, setNuevo] = useState({ material: "", cantidad: "", sentido: "sale" as "sale" | "entra", fecha: hoy(), notas: "" });
  const lineas = controlMaterial(movimientos.map((m) => ({ ...m, cantidad: Number(m.cantidad) })));

  async function anadir(e: FormEvent) {
    e.preventDefault();
    if (!nuevo.material.trim() || !(Number(nuevo.cantidad) > 0)) return toast.error("Pon el material y la cantidad");
    const inv = inventario.find((i) => i.material.toLowerCase() === nuevo.material.trim().toLowerCase());
    const { error } = await sb.from("material_movimientos").insert({
      evento_id: eventoId, inventario_id: inv?.id ?? null, material: nuevo.material.trim(),
      cantidad: Number(nuevo.cantidad), sentido: nuevo.sentido, fecha: nuevo.fecha || null, notas: nuevo.notas.trim() || null,
    });
    if (error) return toast.error(error.message);
    setNuevo({ ...nuevo, material: "", cantidad: "", notas: "" });
  }

  // Apuntar que vuelve exactamente lo que salió
  async function vuelveTodo(material: string, cantidad: number) {
    const { error } = await sb.from("material_movimientos").insert({ evento_id: eventoId, material, cantidad, sentido: "entra", fecha: hoy() });
    if (error) toast.error(error.message);
  }

  const resumen = { ok: 0, faltan: 0, sobran: 0, pendiente: 0 };
  lineas.forEach((l) => resumen[l.estado]++);

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-[15px] font-semibold">Control de material</h2>
        {resumen.faltan > 0 && <Etiqueta className={ESTADO.faltan.clase}>{resumen.faltan} FALTAN</Etiqueta>}
        {resumen.sobran > 0 && <Etiqueta className={ESTADO.sobran.clase}>{resumen.sobran} SOBRAN</Etiqueta>}
        {resumen.pendiente > 0 && <Etiqueta className={ESTADO.pendiente.clase}>{resumen.pendiente} fuera</Etiqueta>}
        {lineas.length > 0 && resumen.ok === lineas.length && <Etiqueta className={ESTADO.ok.clase}>Todo OK</Etiqueta>}
      </div>

      {lineas.length === 0 && <p className="text-sm text-muted-foreground">Apunta cada material que sale. Cuando vuelva, apunta lo que entra y el CRM lo cuadra solo.</p>}
      {lineas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-1.5 font-medium">Material</th><th className="py-1.5 text-right font-medium">Sale</th><th className="py-1.5 text-right font-medium">Entra</th><th className="py-1.5 pl-3 font-medium">Check</th><th /></tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.material} className="border-t">
                  <td className="py-2">{l.material}</td>
                  <td className="py-2 text-right">{l.sale}</td>
                  <td className="py-2 text-right">{l.estado === "pendiente" ? "—" : l.entra}</td>
                  <td className="py-2 pl-3"><Etiqueta className={ESTADO[l.estado].clase}>{ESTADO[l.estado].texto}{l.diferencia !== 0 && l.estado !== "pendiente" ? ` ${Math.abs(l.diferencia)}` : ""}</Etiqueta></td>
                  <td className="py-2 text-right">
                    {l.estado === "pendiente" && <Button variant="ghost" size="xs" onClick={() => vuelveTodo(l.material, l.sale)}>Vuelve todo</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={anadir} className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-[1.6fr_0.7fr_0.9fr_1fr_auto]">
        <Input aria-label="Material" list="inventario-materiales" placeholder="Material" value={nuevo.material} onChange={(e) => setNuevo({ ...nuevo, material: e.target.value })} />
        <datalist id="inventario-materiales">{inventario.map((i) => <option key={i.id} value={i.material} />)}</datalist>
        <Input aria-label="Cantidad" type="number" min={0} step="1" placeholder="Cant." value={nuevo.cantidad} onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })} />
        <select aria-label="Sale o entra" className={claseSelect} value={nuevo.sentido} onChange={(e) => setNuevo({ ...nuevo, sentido: e.target.value as "sale" | "entra" })}>
          <option value="sale">Sale</option>
          <option value="entra">Entra</option>
        </select>
        <Input aria-label="Fecha" type="date" value={nuevo.fecha} onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} />
        <Button type="submit" variant="outline">Apuntar</Button>
      </form>

      {movimientos.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13px] text-muted-foreground">Ver movimientos ({movimientos.length})</summary>
          <ul className="mt-2">
            {movimientos.map((m) => (
              <li key={m.id} className="flex items-center gap-2 border-t py-1.5 text-[13px]">
                <span className="w-20 text-muted-foreground">{formatoFecha(m.fecha)}</span>
                <span className={m.sentido === "sale" ? "text-[#B0302A]" : "text-[#25683D]"}>{m.sentido === "sale" ? "Sale" : "Entra"}</span>
                <span className="flex-1">{m.cantidad} · {m.material}{m.notas && <span className="text-muted-foreground"> · {m.notas}</span>}</span>
                <Button variant="ghost" size="icon-xs" aria-label="Borrar movimiento" onClick={() => moverAPapelera("material_movimientos", m.id).catch((e) => toast.error(e.message))}>
                  <Trash2 className="size-3" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
