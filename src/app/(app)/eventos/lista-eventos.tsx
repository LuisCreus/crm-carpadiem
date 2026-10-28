"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Cabecera } from "@/components/cabecera";
import { EstadoVacio } from "@/components/estado-vacio";
import { Etiqueta, CLASE_CONFIRMADO, CLASE_SEGURO } from "@/components/etiqueta-estado";
import { Button } from "@/components/ui/button";
import { textoCobro, useEventos } from "@/hooks/use-eventos";
import { nombreDe, useListas } from "@/hooks/use-listas";
import { formatoEuros } from "@/lib/formato";
import { MESES, textoFechaEvento } from "@/lib/negocio";
import { cn } from "@/lib/utils";

export function ListaEventos() {
  const listas = useListas();
  const { datos, cargando } = useEventos();
  const [cuales, setCuales] = useState<"proximos" | "pasados" | "cancelados">("proximos");
  const hoy = new Date().toISOString().slice(0, 10);

  const lista = useMemo(() => {
    const fin = (e: (typeof datos)[number]) => e.fecha_fin ?? e.fecha_inicio ?? "9999";
    if (cuales === "cancelados") return datos.filter((e) => e.estado !== "activo");
    const activos = datos.filter((e) => e.estado === "activo");
    return cuales === "proximos"
      ? activos.filter((e) => fin(e) >= hoy)
      : activos.filter((e) => fin(e) < hoy).reverse();
  }, [datos, cuales, hoy]);

  return (
    <>
      <Cabecera titulo="Eventos" subtitulo="Se crean solos al aceptar un presupuesto">
        <Button variant="outline" render={<Link href="/planificacion" />}>Ver planificación</Button>
      </Cabecera>

      <div role="group" aria-label="Qué eventos" className="mb-5 inline-flex overflow-hidden rounded-lg border text-sm">
        {([["proximos", "Próximos"], ["pasados", "Pasados"], ["cancelados", "Cancelados"]] as const).map(([v, t]) => (
          <button key={v} type="button" aria-pressed={cuales === v} onClick={() => setCuales(v)}
            className={cn("px-3 py-1.5", cuales === v ? "bg-foreground text-background" : "bg-card")}>{t}</button>
        ))}
      </div>

      {!cargando && lista.length === 0 && (
        <EstadoVacio
          titulo={cuales === "proximos" ? "No hay eventos próximos" : "Nada por aquí"}
          texto="Cuando un cliente acepte un presupuesto, su evento aparecerá aquí y en la Planificación."
        >
          <Button render={<Link href="/presupuestos" />}>Ir a presupuestos</Button>
        </EstadoVacio>
      )}

      {lista.length > 0 && (
        <ul className="divide-y rounded-xl border bg-card">
          {lista.map((e) => {
            const cobro = textoCobro(e, formatoEuros);
            const [anio, mes, dia] = (e.fecha_inicio ?? "").split("-");
            return (
              <li key={e.id}>
                <Link href={`/eventos/${e.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 md:px-5">
                  <div className="w-12 shrink-0 text-center">
                    <div className="text-xl leading-none font-semibold">{e.fecha_precision === "dia" && dia ? dia : "—"}</div>
                    <div className="mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">
                      {mes ? MESES[Number(mes) - 1].slice(0, 3) : "s/f"} {anio?.slice(2)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {e.cliente?.nombre} <span className="font-normal text-muted-foreground">· {nombreDe(listas.tiposEvento, e.tipo_evento)}{e.presupuesto && ` · ${e.presupuesto.codigo}`}</span>
                    </div>
                    <div className="truncate text-[13px] text-muted-foreground">
                      {[e.material, e.ubicacion, e.provincia].filter(Boolean).join(" · ")}
                      {e.fecha_precision !== "dia" && ` · ${textoFechaEvento(e.fecha_precision, e.fecha_inicio)}`}
                    </div>
                  </div>
                  <div className="hidden text-right text-[13px] sm:block">
                    <div>{formatoEuros(e.importe)}</div>
                    <div className={cobro.completo ? "text-[#25683D]" : "text-muted-foreground"}>{cobro.texto}</div>
                  </div>
                  {e.estado === "cancelado_reserva_retenida"
                    ? <Etiqueta className="bg-muted text-muted-foreground">Cancelado · retenido</Etiqueta>
                    : e.estado === "cancelado"
                      ? <Etiqueta className="bg-muted text-muted-foreground">Cancelado</Etiqueta>
                      : <Etiqueta className={e.modalidad === "seguro" ? CLASE_SEGURO : CLASE_CONFIRMADO}>{e.modalidad === "seguro" ? "Seguro" : "Confirmado"}</Etiqueta>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
