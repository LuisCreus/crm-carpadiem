"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Cabecera } from "@/components/cabecera";
import { Button } from "@/components/ui/button";
import { nombreDe, useListas } from "@/hooks/use-listas";
import { useRentabilidad, type FacturaDetalle, type GastoDetalle } from "@/hooks/use-rentabilidad";
import { formatoEuros, formatoFecha, hoyMadrid } from "@/lib/formato";
import { MESES } from "@/lib/negocio";
import { rentabilidadEvento, resumenMensual, type Rentabilidad } from "@/lib/rentabilidad";
import { cn } from "@/lib/utils";
import { PestanasFinanzas } from "../pestanas";
import { RevisarEmparejamiento } from "./revisar";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Rentabilidad: mes a mes (por mes del evento, como el P&L) y la lista de eventos con su margen
export function ResumenRentabilidad() {
  const [anio, setAnio] = useState(Number(hoyMadrid().slice(0, 4)));
  const [orden, setOrden] = useState<"fecha" | "margen">("fecha");
  const { datos, cargando } = useRentabilidad();
  const [abierto, setAbierto] = useState<string | null>(null);

  const meses = useMemo(() => resumenMensual(anio, datos.eventos, datos.gastos, datos.facturas), [anio, datos]);
  const total = meses.reduce((s, m) => ({ ingresos: s.ingresos + m.ingresos, gastos: s.gastos + m.gastos }), { ingresos: 0, gastos: 0 });
  const margenTotal = total.ingresos - total.gastos;

  const eventos = useMemo(() => datos.eventos
    .filter((e) => e.estado !== "cancelado" && (e.es_larga_duracion || !e.fecha_inicio || e.fecha_inicio.startsWith(String(anio))))
    .map((e) => ({ e, r: rentabilidadEvento(e, datos.gastos, datos.facturas) }))
    .sort((a, b) => orden === "margen"
      ? b.r.margen - a.r.margen
      : (a.e.fecha_inicio ?? "9999").localeCompare(b.e.fecha_inicio ?? "9999")), [datos, anio, orden]);

  return (
    <>
      <Cabecera titulo="Finanzas" subtitulo="Rentabilidad de los eventos: lo aceptado menos sus gastos, sin IVA">
        <div role="group" aria-label="Año" className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Año anterior" onClick={() => setAnio(anio - 1)}><ChevronLeft className="size-4" aria-hidden /></Button>
          <span className="min-w-14 text-center font-semibold">{anio}</span>
          <Button variant="outline" size="icon" aria-label="Año siguiente" onClick={() => setAnio(anio + 1)}><ChevronRight className="size-4" aria-hidden /></Button>
        </div>
      </Cabecera>
      <PestanasFinanzas activa="rentabilidad" />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {([["Ingresos", total.ingresos], ["Gastos de eventos", total.gastos], ["Margen bruto", margenTotal]] as const).map(([t, v]) => (
          <div key={t} className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">{t} {anio}</div>
            <div className={cn("text-xl font-semibold", t === "Margen bruto" && (v < 0 ? "text-destructive" : "text-[#25683D]"))}>{formatoEuros(v)}</div>
            {t === "Margen bruto" && <div className="text-xs text-muted-foreground">{pct(total.ingresos ? margenTotal / total.ingresos : null)} de los ingresos</div>}
          </div>
        ))}
      </div>

      <section className="mb-6 overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2.5 font-medium">Mes</th>
              <th className="px-3 py-2.5 text-right font-medium">Eventos</th>
              <th className="px-3 py-2.5 text-right font-medium">Ingresos</th>
              <th className="px-3 py-2.5 text-right font-medium">Gastos</th>
              <th className="px-3 py-2.5 text-right font-medium">Margen</th>
              <th className="px-4 py-2.5 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {meses.filter((m) => m.clave !== "sin-fecha" || m.ingresos || m.gastos).map((m) => (
              <tr key={m.clave} className={cn("border-b last:border-b-0", !m.ingresos && !m.gastos && "text-muted-foreground")}>
                <td className="px-4 py-2">{m.clave === "sin-fecha" ? "Sin fecha" : mayus(MESES[Number(m.clave.slice(5, 7)) - 1])}</td>
                <td className="px-3 py-2 text-right">{m.eventos || "—"}</td>
                <td className="px-3 py-2 text-right">{m.ingresos ? formatoEuros(m.ingresos) : "—"}</td>
                <td className="px-3 py-2 text-right">{m.gastos ? formatoEuros(m.gastos) : "—"}</td>
                <td className={cn("px-3 py-2 text-right font-medium", m.margen < 0 && "text-destructive")}>{m.ingresos || m.gastos ? formatoEuros(m.margen) : "—"}</td>
                <td className="px-4 py-2 text-right">{m.ingresos ? pct(m.margen / m.ingresos) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <RevisarEmparejamiento />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-[15px] font-semibold">Eventos de {anio} <span className="text-xs font-normal text-muted-foreground">· pulsa uno para ver su desglose</span></h2>
        <div role="group" aria-label="Orden" className="inline-flex overflow-hidden rounded-lg border text-sm">
          {([["fecha", "Por fecha"], ["margen", "Por margen"]] as const).map(([v, t]) => (
            <button key={v} type="button" aria-pressed={orden === v} onClick={() => setOrden(v)}
              className={cn("px-3 py-1.5", orden === v ? "bg-foreground text-background" : "bg-card")}>{t}</button>
          ))}
        </div>
      </div>
      {!cargando && eventos.length === 0 && <p className="text-sm text-muted-foreground">No hay eventos en {anio}.</p>}
      {eventos.length > 0 && (
        <ul className="divide-y rounded-xl border bg-card">
          {eventos.map(({ e, r }) => (
            <li key={e.id}>
              <button type="button" aria-expanded={abierto === e.id} onClick={() => setAbierto(abierto === e.id ? null : e.id)}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-muted/40 md:px-5">
                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", abierto !== e.id && "-rotate-90")} aria-hidden />
                <div className="min-w-0 flex-[1_1_220px] text-foreground">
                  <div className="text-sm font-medium">{e.cliente}{e.codigo && <span className="font-normal text-muted-foreground"> · {e.codigo}</span>}</div>
                  <div className="text-[13px] text-muted-foreground">
                    {e.es_larga_duracion ? "Larga duración" : e.fecha_inicio ? formatoFecha(e.fecha_inicio) : "Sin fecha"}
                    {e.estado === "cancelado_reserva_retenida" && " · cancelado, reserva retenida"}
                    {r.comisionPrevista > 0 && ` · comisión prevista ${formatoEuros(r.comisionPrevista)}`}
                  </div>
                </div>
                <div className="text-right text-[13px] text-muted-foreground">{formatoEuros(r.ingresos)} − {formatoEuros(r.gastos + r.comisionPrevista)}</div>
                <div className={cn("w-32 text-right text-sm font-semibold", r.margen < 0 ? "text-destructive" : "text-[#25683D]")}>
                  {formatoEuros(r.margen)} <span className="text-xs font-normal">{pct(r.margenPct)}</span>
                </div>
              </button>
              {abierto === e.id && (
                <DesgloseEvento eventoId={e.id} r={r}
                  facturas={datos.facturas.filter((f) => f.evento_id === e.id && f.estado !== "prevista")}
                  gastos={datos.gastos.filter((g) => g.evento_id === e.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[13px] text-muted-foreground">Los costes fijos y de personal (gestoría, web, sueldos…) no se restan aquí: están en la pestaña P&amp;L.</p>
    </>
  );
}

// Lo que hay dentro de un evento: lo facturado y los gastos por categoría, como la hoja Eventos del Excel
function DesgloseEvento({ eventoId, r, facturas, gastos }: { eventoId: string; r: Rentabilidad; facturas: FacturaDetalle[]; gastos: GastoDetalle[] }) {
  const listas = useListas();
  const porCategoria = new Map<string, GastoDetalle[]>();
  for (const g of gastos) porCategoria.set(g.categoria ?? "", [...(porCategoria.get(g.categoria ?? "") ?? []), g]);
  const grupos = [...porCategoria.entries()].map(([c, l]) => ({ c, l, total: l.reduce((s, g) => s + g.base, 0) })).sort((a, b) => b.total - a.total);
  const facturado = facturas.reduce((s, f) => s + f.importe, 0);
  const tipo = (t: string) => ({ reserva: "Reserva", resto: "Resto", mensualidad: "Mensualidad" } as Record<string, string>)[t] ?? "Factura";
  return (
    <div className="grid gap-4 border-t bg-muted/20 px-4 py-4 text-[13px] md:grid-cols-2 md:px-5">
      <div>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Facturado al cliente</h3>
        {facturas.length === 0 && <p className="text-muted-foreground">Todavía no hay facturas emitidas.</p>}
        <ul className="grid gap-1">
          {facturas.map((f) => (
            <li key={f.id} className="flex gap-2">
              <span className="flex-1">{f.codigo} · {tipo(f.tipo)}
                <span className="text-muted-foreground"> · {f.fecha_emision ? formatoFecha(f.fecha_emision) : ""}{f.estado === "pagada" ? " · cobrada" : " · por cobrar"}</span></span>
              <span className="tabular-nums">{formatoEuros(f.importe)}</span>
            </li>
          ))}
        </ul>
        {facturas.length > 0 && Math.abs(facturado - r.ingresos) >= 1 && (
          <p className="mt-1.5 text-muted-foreground">Facturado {formatoEuros(facturado)} de {formatoEuros(r.ingresos)} aceptados.</p>
        )}
      </div>
      <div>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Gastos del evento</h3>
        {grupos.length === 0 && r.comisionPrevista === 0 && <p className="text-muted-foreground">Sin gastos apuntados.</p>}
        <ul className="grid gap-2">
          {grupos.map(({ c, l, total }) => (
            <li key={c}>
              <div className="flex gap-2 font-medium"><span className="flex-1">{c ? nombreDe(listas.categoriasGasto, c) : "Sin categoría"}</span><span className="tabular-nums">{formatoEuros(total)}</span></div>
              <ul className="ml-3 text-muted-foreground">
                {l.map((g) => (
                  <li key={g.id} className="flex gap-2">
                    <span className="flex-1 truncate">{[g.proveedor, g.numero && `nº ${g.numero}`, formatoFecha(g.fecha)].filter(Boolean).join(" · ")}</span>
                    <span className="tabular-nums">{formatoEuros(g.base)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {r.comisionPrevista > 0 && (
            <li className="flex gap-2 font-medium"><span className="flex-1">Comisión prevista <span className="font-normal text-muted-foreground">(hasta que llegue su factura)</span></span><span className="tabular-nums">{formatoEuros(r.comisionPrevista)}</span></li>
          )}
        </ul>
        <p className="mt-2 text-muted-foreground">Importes sin IVA. <Link href={`/eventos/${eventoId}`}>Abrir el evento</Link> para añadir o cambiar gastos.</p>
      </div>
    </div>
  );
}
