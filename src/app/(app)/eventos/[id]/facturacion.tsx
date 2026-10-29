"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogoDatosFacturacion, DialogoFactura, LineaFactura, TextoDatosFacturacion, datosEfectivos,
} from "@/components/facturas";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { SELECT_FACTURA, aFactura, type Evento, type Factura } from "@/lib/datos/tipos";
import { conceptoMensualidad, resumenFacturacion } from "@/lib/facturacion";
import { formatoEuros, hoyMadrid } from "@/lib/formato";

// Tarjeta "Facturación" de la ficha del evento: qué se ha facturado y qué falta
export function TarjetaFacturacion({ e, cobrado }: { e: Evento; cobrado: number }) {
  const [dialogo, setDialogo] = useState<"datos" | "nueva" | "mensualidad" | Factura | null>(null);
  const { datos: facturas } = useTablaEnVivo<Factura>(["facturas"], async (sb) => {
    const { data, error } = await sb.from("facturas").select(SELECT_FACTURA).eq("evento_id", e.id).is("deleted_at", null)
      .order("numero", { ascending: true, nullsFirst: false }).order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []).map(aFactura);
  });

  const datos = datosEfectivos(e, e.cliente);
  const r = resumenFacturacion(e.es_larga_duracion ? null : e.importe, facturas, cobrado);
  const hoy = hoyMadrid();

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-3.5 flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-semibold">Facturación</h2>
        {e.es_larga_duracion && (
          <Button size="sm" variant="outline" onClick={() => setDialogo("mensualidad")}>
            <Plus className="size-4" aria-hidden /> Mensualidad
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setDialogo("nueva")}>
          <Plus className="size-4" aria-hidden /> Factura
        </Button>
      </div>

      {!e.es_larga_duracion && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ["Total (sin IVA)", r.total],
            ["Facturado", r.facturado],
            ["Por facturar", r.porFacturar],
            ["Por cobrar", r.porCobrar],
          ] as const).map(([t, v]) => (
            <div key={t}>
              <div className="text-xs text-muted-foreground">{t}</div>
              <div className="text-[15px] font-semibold">{formatoEuros(v)}</div>
            </div>
          ))}
        </div>
      )}
      {e.es_larga_duracion && (
        <p className="mb-3 text-sm text-muted-foreground">
          Proyecto de larga duración · cuota mensual {e.cuota_mensual ? formatoEuros(Number(e.cuota_mensual)) : "sin definir (ponla en Editar)"}
        </p>
      )}

      <div className="mb-3 flex items-start gap-3 rounded-lg border bg-background p-3">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 text-xs text-muted-foreground">{datos.deOtro ? "Se factura a (solo este evento)" : "Se factura al cliente"}</div>
          <TextoDatosFacturacion d={datos} />
        </div>
        <Button size="sm" variant="ghost" onClick={() => setDialogo("datos")}>Cambiar</Button>
      </div>

      {facturas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {e.importe ? "No hay facturas." : "Pon el importe en el presupuesto para preparar la reserva y el resto."}
        </p>
      ) : (
        <ul>
          {facturas.map((f) => (
            <LineaFactura key={f.id} f={f} datos={datos} editar={() => setDialogo(f)} />
          ))}
        </ul>
      )}

      {dialogo === "datos" && e.cliente && (
        <DialogoDatosFacturacion cerrar={() => setDialogo(null)} clienteId={e.cliente.id} eventoId={e.id}
          inicial={datos} inicialSoloEvento={datos.deOtro} />
      )}
      {(dialogo === "nueva" || dialogo === "mensualidad") && (
        <DialogoFactura cerrar={() => setDialogo(null)} eventoId={e.id} clienteId={e.cliente_id}
          inicial={dialogo === "mensualidad"
            ? { tipo: "mensualidad", concepto: conceptoMensualidad(hoy), importe: e.cuota_mensual !== null ? Number(e.cuota_mensual) : null }
            : undefined} />
      )}
      {dialogo !== null && typeof dialogo === "object" && (
        <DialogoFactura cerrar={() => setDialogo(null)} factura={dialogo} eventoId={e.id} clienteId={e.cliente_id} />
      )}
    </section>
  );
}
