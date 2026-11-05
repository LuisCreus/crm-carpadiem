"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Cabecera } from "@/components/cabecera";
import { EstadoVacio } from "@/components/estado-vacio";
import { LineaFactura, datosEfectivos, porEnviar } from "@/components/facturas";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { SELECT_FACTURA, aFactura, uno, type DatosFacturacion, type Factura } from "@/lib/datos/tipos";
import { totalFactura } from "@/lib/facturacion";
import { formatoEuros, formatoFecha, hoyMadrid } from "@/lib/formato";
import { sumarDias } from "@/lib/operativa";
import { cn } from "@/lib/utils";
import { PestanasFacturas } from "./pestanas";

type FacturaLista = Factura & {
  evento: (DatosFacturacion & {
    id: string; fecha_inicio: string | null; fecha_precision: string; cliente: ({ nombre: string } & DatosFacturacion) | null; presupuesto: { codigo: string } | null;
  }) | null;
};

// Cuándo toca emitir una factura por emitir: la reserva y las mensualidades, ya; el resto (y otras),
// unos días antes del evento (Ajustes → aviso del resto, 7 por defecto)
function cuandoEmitir(f: FacturaLista, diasAntes: number): string | null {
  if (f.estado !== "prevista" || f.tipo === "reserva" || f.tipo === "mensualidad") return null; // ya
  const e = f.evento;
  if (!e?.fecha_inicio || e.fecha_precision === "por_definir") return "9999-12-31"; // sin fecha: más adelante
  return sumarDias(e.fecha_inicio, -diasAntes);
}
const fechaEvento = (f: FacturaLista) => f.evento?.fecha_inicio && f.evento.fecha_precision !== "por_definir" ? f.evento.fecha_inicio : "9999-12-31";

const FILTROS = [
  ["por_emitir", "Por emitir o enviar"],
  ["sin_cobrar", "Enviadas sin cobrar"],
  ["pagadas", "Pagadas"],
  ["todas", "Todas"],
] as const;

export function ListaFacturas() {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number][0]>("por_emitir");
  const [diasAntes, setDiasAntes] = useState(7);
  const hoy = hoyMadrid();
  const anio = Number(hoyMadrid().slice(0, 4));
  const fiscales = "fact_nombre, fact_nif, fact_domicilio, fact_cp_ciudad, fact_email";
  const { datos, cargando } = useTablaEnVivo<FacturaLista>(["facturas", "eventos", "clientes", "ajustes"], async (sb) => {
    const { data: aj } = await sb.from("ajustes").select("dias_aviso_resto").maybeSingle();
    setDiasAntes(aj?.dias_aviso_resto ?? 7);
    const { data, error } = await sb.from("facturas")
      .select(`${SELECT_FACTURA}, evento:eventos(id, fecha_inicio, fecha_precision, ${fiscales}, cliente:clientes(nombre, ${fiscales}), presupuesto:presupuestos(codigo))`)
      .is("deleted_at", null).order("anio", { ascending: false, nullsFirst: true }).order("numero", { ascending: false, nullsFirst: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((f) => {
      const ev = uno(f.evento) as FacturaLista["evento"];
      return { ...aFactura(f), evento: ev && { ...ev, cliente: uno(ev.cliente), presupuesto: uno(ev.presupuesto) } };
    });
  });

  const lista = useMemo(() => {
    const l = datos.filter((f) =>
      filtro === "por_emitir" ? f.estado === "prevista" || porEnviar(f)
      : filtro === "sin_cobrar" ? f.estado === "emitida" && !porEnviar(f)
      : filtro === "pagadas" ? f.estado === "pagada"
      : true);
    // Por emitir: por fecha del evento (la primera es la que antes toca)
    return filtro === "por_emitir" ? [...l].sort((a, b) => fechaEvento(a).localeCompare(fechaEvento(b))) : l;
  }, [datos, filtro]);
  // Por emitir, en dos partes: lo que toca ya y lo de más adelante
  const yaToca = filtro === "por_emitir" ? lista.filter((f) => { const c = cuandoEmitir(f, diasAntes); return c === null || c <= hoy; }) : lista;
  const masAdelante = filtro === "por_emitir" ? lista.filter((f) => { const c = cuandoEmitir(f, diasAntes); return c !== null && c > hoy; }) : [];

  const suma = (l: Factura[]) => l.reduce((s, f) => s + f.importe, 0);
  const porEmitir = datos.filter((f) => f.estado === "prevista" || porEnviar(f));
  const sinCobrar = datos.filter((f) => f.estado === "emitida" && !porEnviar(f));
  const delAnio = datos.filter((f) => f.estado !== "prevista" && f.anio === anio);

  return (
    <>
      <Cabecera titulo="Facturas" subtitulo="Lo que falta por facturar y por cobrar, con la numeración CD AAAA/n" />
      <PestanasFacturas activa="emitidas" />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {([
          ["Por emitir o enviar", porEmitir, "por_emitir"],
          ["Enviadas sin cobrar", sinCobrar, "sin_cobrar"],
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

      {filtro === "por_emitir" && lista.length > 0 && (
        <h2 className="mb-2 text-sm font-semibold">Emitir ya <span className="font-normal text-muted-foreground">· reservas, mensualidades y eventos de los próximos {diasAntes} días</span></h2>
      )}
      {yaToca.length > 0 && <Lista facturas={yaToca} hoy={hoy} />}
      {filtro === "por_emitir" && lista.length > 0 && yaToca.length === 0 && (
        <p className="rounded-xl border border-dashed bg-card px-4 py-3 text-sm text-muted-foreground">Nada que emitir ahora mismo ✓</p>
      )}
      {masAdelante.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-semibold">Más adelante <span className="font-normal text-muted-foreground">· el resto se emite {diasAntes} días antes del evento</span></h2>
          <Lista facturas={masAdelante} hoy={hoy} cuando={(f) => cuandoEmitir(f, diasAntes)} />
        </>
      )}
    </>
  );
}

function Lista({ facturas, hoy, cuando }: { facturas: FacturaLista[]; hoy: string; cuando?: (f: FacturaLista) => string | null }) {
  return (
    <ul className="rounded-xl border bg-card px-4 md:px-5">
      {facturas.map((f) => {
        const datosF = f.evento ? datosEfectivos(f.evento, f.evento.cliente) : f;
        const quien = f.fact_nombre ?? f.evento?.cliente?.nombre ?? "Sin evento";
        const emitir = cuando?.(f);
        const evento = fechaEvento(f);
        return (
          <LineaFactura key={f.id} f={f} datos={datosF}
            extra={<>
              {f.evento
                ? <Link href={`/eventos/${f.evento.id}`}>{quien}{f.evento.presupuesto && ` · ${f.evento.presupuesto.codigo}`}</Link>
                : quien}
              {evento !== "9999-12-31" && <span className="text-muted-foreground"> · evento {formatoFecha(evento)}{evento < hoy ? " (ya pasó)" : ""}</span>}
              {emitir && emitir !== "9999-12-31" && <span className="text-muted-foreground"> · emitir a partir del {formatoFecha(emitir)}</span>}
            </>} />
        );
      })}
    </ul>
  );
}
