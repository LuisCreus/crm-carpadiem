"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Cabecera } from "@/components/cabecera";
import { Button } from "@/components/ui/button";
import { useRentabilidad } from "@/hooks/use-rentabilidad";
import { formatoEuros, formatoFecha, hoyMadrid } from "@/lib/formato";
import { MESES } from "@/lib/negocio";
import { rentabilidadEvento, resumenMensual } from "@/lib/rentabilidad";
import { cn } from "@/lib/utils";
import { PestanasFinanzas } from "../pestanas";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Rentabilidad: mes a mes (por mes del evento, como el P&L) y la lista de eventos con su margen
export function ResumenRentabilidad() {
  const [anio, setAnio] = useState(Number(hoyMadrid().slice(0, 4)));
  const [orden, setOrden] = useState<"fecha" | "margen">("fecha");
  const { datos, cargando } = useRentabilidad();

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

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-[15px] font-semibold">Eventos de {anio}</h2>
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
              <Link href={`/eventos/${e.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 no-underline hover:bg-muted/40 md:px-5">
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
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[13px] text-muted-foreground">Los costes fijos y de personal (gestoría, web, sueldos…) no se restan aquí: siguen en el P&amp;L del Excel.</p>
    </>
  );
}
