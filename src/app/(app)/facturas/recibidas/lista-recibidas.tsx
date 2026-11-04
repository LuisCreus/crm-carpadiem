"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Cabecera } from "@/components/cabecera";
import { EstadoVacio } from "@/components/estado-vacio";
import { DialogoGasto, LineaGasto } from "@/components/gastos";
import { DialogoPagoBanco } from "@/components/pago-banco";
import { Button } from "@/components/ui/button";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { SELECT_FACTURA_RECIBIDA, aFacturaRecibida, type FacturaRecibida } from "@/lib/datos/tipos";
import { formatoEuros, hoyMadrid } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { PestanasFacturas } from "../pestanas";
import { useEsAdmin, useSoloLectura } from "@/components/usuario";

const FILTROS = [["por_pagar", "Por pagar"], ["pagadas", "Pagadas"], ["todas", "Todas"]] as const;

export function ListaRecibidas() {
  const esAdmin = useEsAdmin();
  const soloLectura = useSoloLectura();
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number][0]>("por_pagar");
  const [nueva, setNueva] = useState(false);
  // Facturas elegidas para pagar con el fichero del Santander
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [pagando, setPagando] = useState(false);
  const cambiar = (id: string) => setElegidas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const hoy = hoyMadrid();
  const { datos, cargando } = useTablaEnVivo<FacturaRecibida>(["facturas_recibidas", "proveedores", "eventos"], async (sb) => {
    const { data, error } = await sb.from("facturas_recibidas").select(SELECT_FACTURA_RECIBIDA)
      .is("deleted_at", null).order("fecha", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(aFacturaRecibida);
  });

  const lista = useMemo(() => datos.filter((g) =>
    filtro === "por_pagar" ? g.estado === "pendiente" : filtro === "pagadas" ? g.estado === "pagada" : true), [datos, filtro]);
  const porPagar = datos.filter((g) => g.estado === "pendiente");
  const vencidas = porPagar.filter((g) => g.vencimiento && g.vencimiento < hoy);
  const delMes = datos.filter((g) => g.fecha.startsWith(hoy.slice(0, 7)));
  const suma = (l: FacturaRecibida[]) => l.reduce((s, g) => s + g.total, 0);
  const seleccionadas = porPagar.filter((g) => elegidas.has(g.id));

  return (
    <>
      <Cabecera titulo="Facturas" subtitulo="Lo que nos facturan los proveedores y lo que falta por pagar">
        {!soloLectura && <Button onClick={() => setNueva(true)}><Plus className="size-4" aria-hidden /> Factura recibida</Button>}
      </Cabecera>
      <PestanasFacturas activa="recibidas" />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {([
          ["Por pagar", porPagar, "por_pagar"],
          ["Vencidas", vencidas, "por_pagar"],
          ["Recibidas este mes", delMes, "todas"],
        ] as const).map(([t, l, f]) => (
          <button key={t} type="button" onClick={() => setFiltro(f)} className="rounded-xl border bg-card p-4 text-left hover:bg-muted/40">
            <div className="text-xs text-muted-foreground">{t}</div>
            <div className="text-xl font-semibold">{formatoEuros(suma(l))}</div>
            <div className="text-xs text-muted-foreground">{l.length} {l.length === 1 ? "factura" : "facturas"}</div>
          </button>
        ))}
      </div>

      <div role="group" aria-label="Qué facturas" className="mb-4 inline-flex overflow-hidden rounded-lg border text-sm">
        {FILTROS.map(([v, t]) => (
          <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)}
            className={cn("px-3 py-1.5", filtro === v ? "bg-foreground text-background" : "bg-card")}>{t}</button>
        ))}
      </div>

      {!cargando && lista.length === 0 && (
        <EstadoVacio titulo={filtro === "por_pagar" ? "No hay nada por pagar" : "Todavía no hay facturas recibidas"}
          texto="Cuando te llegue una factura de un proveedor, apúntala aquí con su PDF.">
          <Button onClick={() => setNueva(true)}>Añadir factura recibida</Button>
        </EstadoVacio>
      )}
      {lista.length > 0 && (
        <ul className="rounded-xl border bg-card px-4 md:px-5">
          {lista.map((g) => (
            <LineaGasto key={g.id} g={g}
              seleccion={g.estado === "pendiente" ? { marcada: elegidas.has(g.id), cambiar: () => cambiar(g.id) } : undefined} />
          ))}
        </ul>
      )}
      {esAdmin && porPagar.length > 0 && (
        <div className="sticky bottom-20 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-sm md:bottom-4">
          <span className="flex-1 text-sm">
            {seleccionadas.length
              ? <>{seleccionadas.length} {seleccionadas.length === 1 ? "elegida" : "elegidas"} · <b>{formatoEuros(suma(seleccionadas))}</b></>
              : "Marca las facturas que quieres pagar"}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setElegidas(new Set(porPagar.filter((g) => !g.fichero_pago_at).map((g) => g.id)))}>Elegir todas</Button>
          <Button disabled={!seleccionadas.length} onClick={() => setPagando(true)}>Pagar con el Santander</Button>
        </div>
      )}
      {pagando && (
        <DialogoPagoBanco facturas={seleccionadas} cerrar={() => setPagando(false)}
          alTerminar={() => { setPagando(false); setElegidas(new Set()); }} />
      )}
      {nueva && <DialogoGasto cerrar={() => setNueva(false)} />}
    </>
  );
}
