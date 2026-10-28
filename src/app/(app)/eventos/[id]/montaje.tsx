"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Share2 } from "lucide-react";
import { Campo, claseSelect } from "@/components/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useListas } from "@/hooks/use-listas";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { guardarHojaMontaje } from "@/lib/documentos";
import type { Contacto, Evento } from "@/lib/datos/tipos";
import { formatoFechaHora } from "@/lib/formato";
import { cn } from "@/lib/utils";

// timestamptz → valor de <input type="datetime-local"> (hora de Madrid del navegador)
const aLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const aIso = (local: string) => (local ? new Date(local).toISOString() : null);

export function TarjetaMontaje({ evento: e, contactos, montadoresAsignados }: {
  evento: Evento; contactos: Contacto[]; montadoresAsignados: string[];
}) {
  const listas = useListas();
  const sb = crearClienteNavegador();
  const [c, setC] = useState({
    montaje_inicio: aLocal(e.montaje_inicio),
    montaje_fin: aLocal(e.montaje_fin),
    desmontaje_inicio: aLocal(e.desmontaje_inicio),
    desmontaje_fin: aLocal(e.desmontaje_fin),
    contacto_destino_id: e.contacto_destino_id ?? "",
    observaciones_montaje: e.observaciones_montaje ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const [generando, setGenerando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const { error } = await sb.from("eventos").update({
      montaje_inicio: aIso(c.montaje_inicio),
      montaje_fin: aIso(c.montaje_fin),
      desmontaje_inicio: aIso(c.desmontaje_inicio),
      desmontaje_fin: aIso(c.desmontaje_fin),
      contacto_destino_id: c.contacto_destino_id || null,
      observaciones_montaje: c.observaciones_montaje.trim() || null,
    }).eq("id", e.id);
    setGuardando(false);
    if (error) toast.error(error.message);
    else toast.success("Guardado ✓");
  }

  async function alternarMontador(id: string) {
    const { error } = montadoresAsignados.includes(id)
      ? await sb.from("evento_montadores").delete().eq("evento_id", e.id).eq("montador_id", id)
      : await sb.from("evento_montadores").insert({ evento_id: e.id, montador_id: id });
    if (error) toast.error(error.message);
  }

  async function hojaEnSharePoint() {
    setGenerando(true);
    const r = await guardarHojaMontaje(e.id);
    setGenerando(false);
    if (!r.ok) toast.error(r.error);
    else toast.success(`${r.nombre} guardada en la carpeta del cliente ✓`);
  }

  async function compartir() {
    try {
      const r = await fetch(`/api/hoja-montaje/${e.id}`);
      if (!r.ok) throw new Error("No se pudo generar la hoja");
      const nombre = decodeURIComponent(r.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''(.+)$/)?.[1] ?? "hoja-de-montaje.pdf");
      const archivo = new File([await r.blob()], nombre, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [archivo] })) await navigator.share({ files: [archivo], title: nombre });
      else window.open(`/api/hoja-montaje/${e.id}?ver=1`, "_blank");
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") toast.error(err.message);
    }
  }

  const fila = (clave: "montaje_inicio" | "montaje_fin" | "desmontaje_inicio" | "desmontaje_fin", etiqueta: string) => (
    <Campo id={`m-${clave}`} etiqueta={etiqueta}>
      <Input id={`m-${clave}`} type="datetime-local" value={c[clave]} onChange={(x) => setC({ ...c, [clave]: x.target.value })} />
    </Campo>
  );

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-3.5 flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-semibold">Montaje</h2>
        <Button variant="outline" size="sm" disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : "Guardar"}</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {fila("montaje_inicio", "Montaje · empieza")}
        {fila("montaje_fin", "Montaje · termina")}
        {fila("desmontaje_inicio", "Desmontaje · empieza")}
        {fila("desmontaje_fin", "Desmontaje · termina")}
        <Campo id="m-contacto" etiqueta="Contacto en destino" className="sm:col-span-2">
          <select id="m-contacto" className={claseSelect} value={c.contacto_destino_id} onChange={(x) => setC({ ...c, contacto_destino_id: x.target.value })}>
            <option value="">—</option>
            {contactos.map((ct) => <option key={ct.id} value={ct.id}>{ct.nombre}{ct.telefono ? ` · ${ct.telefono}` : ""}</option>)}
          </select>
        </Campo>
        <Campo id="m-obs" etiqueta="Observaciones para los montadores" className="sm:col-span-2">
          <Textarea id="m-obs" rows={3} placeholder="Accesos, enchufes, horario de la finca…" value={c.observaciones_montaje}
            onChange={(x) => setC({ ...c, observaciones_montaje: x.target.value })} />
        </Campo>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-sm font-medium">Montadores</div>
        <div className="flex flex-wrap gap-1.5">
          {listas.montadores.length === 0 && <span className="text-sm text-muted-foreground">No hay montadores en la lista (Ajustes).</span>}
          {listas.montadores.map((m) => {
            const activo = montadoresAsignados.includes(m.id);
            return (
              <button key={m.id} type="button" aria-pressed={activo} onClick={() => alternarMontador(m.id)}
                className={cn("rounded-full border px-3 py-1 text-sm", activo ? "border-foreground bg-foreground text-background" : "bg-background")}>
                {m.nombre}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
        <FileText className="size-4 text-muted-foreground" aria-hidden />
        <span className="mr-auto text-sm">Hoja de montaje <span className="text-muted-foreground">(sin precios)</span></span>
        <Button variant="outline" size="sm" render={<a href={`/api/hoja-montaje/${e.id}`} />}><Download className="size-3.5" aria-hidden /> Descargar</Button>
        <Button variant="outline" size="sm" onClick={compartir}><Share2 className="size-3.5" aria-hidden /> Compartir</Button>
        <Button size="sm" disabled={generando} onClick={hojaEnSharePoint}>{generando ? "Guardando…" : "Guardar en la carpeta"}</Button>
      </div>
      {e.hoja_montaje_url && (
        <p className="mt-2 text-xs text-muted-foreground">
          Última guardada en SharePoint · <a href={e.hoja_montaje_url} target="_blank" rel="noreferrer">abrir</a>
          {e.montaje_inicio && ` · montaje ${formatoFechaHora(e.montaje_inicio)}`}
        </p>
      )}
    </section>
  );
}
