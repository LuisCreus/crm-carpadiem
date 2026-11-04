"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogoGasto, LineaGasto } from "@/components/gastos";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { SELECT_FACTURA_RECIBIDA, aFacturaRecibida, type FacturaRecibida } from "@/lib/datos/tipos";
import { gastosEvento } from "@/lib/gastos";
import { formatoEuros } from "@/lib/formato";
import { useSoloLectura } from "@/components/usuario";

// Gastos del evento: facturas de montadores, furgoneta, gasolina, alquiler de carpas…
export function TarjetaGastos({ eventoId }: { eventoId: string }) {
  const soloLectura = useSoloLectura();
  const [nuevo, setNuevo] = useState(false);
  const { datos: gastos } = useTablaEnVivo<FacturaRecibida>(["facturas_recibidas", "proveedores"], async (sb) => {
    const { data, error } = await sb.from("facturas_recibidas").select(SELECT_FACTURA_RECIBIDA)
      .eq("evento_id", eventoId).is("deleted_at", null).order("fecha");
    if (error) throw new Error(error.message);
    return (data ?? []).map(aFacturaRecibida);
  });

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-3.5 flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-semibold">Gastos</h2>
        {!soloLectura && <Button size="sm" variant="outline" onClick={() => setNuevo(true)}><Plus className="size-4" aria-hidden /> Gasto</Button>}
      </div>
      {gastos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin gastos todavía. Apunta aquí las facturas de montadores, furgoneta, gasolina…</p>
      ) : (
        <>
          <p className="mb-2 text-sm">Total sin IVA: <b>{formatoEuros(gastosEvento(gastos))}</b></p>
          <ul>{gastos.map((g) => <LineaGasto key={g.id} g={g} mostrarEvento={false} />)}</ul>
        </>
      )}
      {nuevo && <DialogoGasto eventoId={eventoId} cerrar={() => setNuevo(false)} />}
    </section>
  );
}
