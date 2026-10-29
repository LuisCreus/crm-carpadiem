"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Cabecera } from "@/components/cabecera";
import { EstadoVacio } from "@/components/estado-vacio";
import { LineaFactura, datosEfectivos } from "@/components/facturas";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { SELECT_FACTURA, aFactura, uno, type DatosFacturacion, type Factura } from "@/lib/datos/tipos";
import { totalFactura } from "@/lib/facturacion";
import { formatoEuros, hoyMadrid } from "@/lib/formato";
import { cn } from "@/lib/utils";

type FacturaLista = Factura & {
  evento: (DatosFacturacion & { id: string; cliente: ({ nombre: string } & DatosFacturacion) | null; presupuesto: { codigo: string } | null }) | null;
};

const FILTROS = [
  ["por_emitir", "Por emitir"],
  ["sin_cobrar", "Emitidas sin cobrar"],
  ["pagadas", "Pagadas"],
  ["todas", "Todas"],
] as const;

export function ListaFacturas() {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number][0]>("por_emitir");
  const anio = Number(hoyMadrid().slice(0, 4));
  const fiscales = "fact_nombre, fact_nif, fact_domicilio, fact_cp_ciudad, fact_email";
  const { datos, cargando } = useTablaEnVivo<FacturaLista>(["facturas", "eventos", "clientes"], async (sb) => {
    const { data, error } = await sb.from("facturas")
      .select(`${SELECT_FACTURA}, evento:eventos(id, ${fiscales}, cliente:clientes(nombre, ${fiscales}), presupuesto:presupuestos(codigo))`)
      .is("deleted_at", null).order("anio", { ascending: false, nullsFirst: true }).order("numero", { ascending: false, nullsFirst: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((f) => {
      const ev = uno(f.evento) as FacturaLista["evento"];
      return { ...aFactura(f), evento: ev && { ...ev, cliente: uno(ev.cliente), presupuesto: uno(ev.presupuesto) } };
    });
  });

  const lista = useMemo(() => datos.filter((f) =>
    filtro === "por_emitir" ? f.estado === "prevista"
    : filtro === "sin_cobrar" ? f.estado === "emitida"
    : filtro === "pagadas" ? f.estado === "pagada"
    : true), [datos, filtro]);

  const suma = (l: Factura[]) => l.reduce((s, f) => s + f.importe, 0);
  const porEmitir = datos.filter((f) => f.estado === "prevista");
  const sinCobrar = datos.filter((f) => f.estado === "emitida");
  const delAnio = datos.filter((f) => f.estado !== "prevista" && f.anio === anio);

  return (
    <>
      <Cabecera titulo="Facturas" subtitulo="Lo que falta por facturar y por cobrar, con la numeración CD AAAA/n" />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {([
          ["Por emitir", porEmitir, "por_emitir"],
          ["Emitidas sin cobrar", sinCobrar, "sin_cobrar"],
          [`Facturado en ${anio}`, delAnio, "todas"],
        ] as const).map(([t, l, f]) => (
          <button key={t} type="button" onClick={() => setFiltro(f)} className="rounded-xl border bg-card p-4 text-left hover:bg-muted/40">
            <div className="text-xs text-muted-foreground">{t}</div>
            <div className="text-xl font-semibold">{formatoEuros(suma(l))}</div>
            <div className="text-xs text-muted-foreground">
              {l.length} {l.length === 1 ? "factura" : "facturas"} · {formatoEuros(l.reduce((s, x) => s + totalFactura(x).total, 0))} con IVA
            </div>
          </button>
        ))}
      </div>

      <div role="group" aria-label="Qué facturas" className="mb-4 inline-flex max-w-full overflow-x-auto rounded-lg border text-sm">
        {FILTROS.map(([v, t]) => (
          <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)}
            className={cn("px-3 py-1.5 whitespace-nowrap", filtro === v ? "bg-foreground text-background" : "bg-card")}>{t}</button>
        ))}
      </div>

      {!cargando && lista.length === 0 && (
        <EstadoVacio titulo="No hay facturas aquí" texto="Las facturas de reserva y resto se preparan solas al aceptar un presupuesto." />
      )}

      {lista.length > 0 && (
        <ul className="rounded-xl border bg-card px-4 md:px-5">
          {lista.map((f) => {
            const datosF = f.evento ? datosEfectivos(f.evento, f.evento.cliente) : f;
            const quien = f.fact_nombre ?? f.evento?.cliente?.nombre ?? "Sin evento";
            return (
              <LineaFactura key={f.id} f={f} datos={datosF}
                extra={f.evento
                  ? <Link href={`/eventos/${f.evento.id}`}>{quien}{f.evento.presupuesto && ` · ${f.evento.presupuesto.codigo}`}</Link>
                  : quien} />
            );
          })}
        </ul>
      )}
    </>
  );
}
