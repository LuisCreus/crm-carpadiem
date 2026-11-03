"use client";

import { useRentabilidad } from "@/hooks/use-rentabilidad";
import { rentabilidadEvento } from "@/lib/rentabilidad";
import { formatoEuros } from "@/lib/formato";
import { cn } from "@/lib/utils";

// Rentabilidad del evento: lo aceptado menos sus gastos (sin IVA)
export function TarjetaRentabilidad({ eventoId }: { eventoId: string }) {
  const { datos } = useRentabilidad(eventoId);
  const e = datos.eventos[0];
  if (!e) return null;
  const r = rentabilidadEvento(e, datos.gastos, datos.facturas);

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-3.5 text-[15px] font-semibold">Rentabilidad <span className="font-normal text-muted-foreground">· sin IVA</span></h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><div className="text-xs text-muted-foreground">{e.es_larga_duracion ? "Facturado" : "Ingresos"}</div><div className="text-[15px] font-semibold">{formatoEuros(r.ingresos)}</div></div>
        <div><div className="text-xs text-muted-foreground">Gastos</div><div className="text-[15px] font-semibold">{formatoEuros(r.gastos)}</div></div>
        <div><div className="text-xs text-muted-foreground">Comisión prevista</div><div className="text-[15px] font-semibold">{r.comisionPrevista ? formatoEuros(r.comisionPrevista) : "—"}</div></div>
        <div>
          <div className="text-xs text-muted-foreground">Margen</div>
          <div className={cn("text-[15px] font-semibold", r.margen < 0 ? "text-destructive" : "text-[#25683D]")}>
            {formatoEuros(r.margen)}{r.margenPct !== null && <span className="ml-1 text-xs font-normal">({Math.round(r.margenPct * 100)} %)</span>}
          </div>
        </div>
      </div>
      {r.comisionPrevista > 0 && (
        <p className="mt-3 text-[13px] text-muted-foreground">La comisión del intermediario se resta como prevista hasta que apuntes su factura (categoría “Comisiones”).</p>
      )}
    </section>
  );
}
