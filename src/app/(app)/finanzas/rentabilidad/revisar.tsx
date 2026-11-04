"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { claseSelect } from "@/components/campo";
import { DialogoGasto } from "@/components/gastos";
import { Button } from "@/components/ui/button";
import { nombreDe, useListas } from "@/hooks/use-listas";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { uno } from "@/lib/datos/tipos";
import { eventosCercanos, porRevisar, type EventoRevision } from "@/lib/emparejamiento";
import { formatoEuros, formatoFecha, hoyMadrid } from "@/lib/formato";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useSoloLectura } from "@/components/usuario";

type Gasto = { id: string; evento_id: string | null; categoria: string | null; fecha: string; base: number; numero: string | null; proveedor: string | null };
type Factura = { id: string; evento_id: string | null; estado: string; fecha_emision: string | null; codigo: string | null; importe: number; fact_nombre: string | null };
type Datos = { eventos: EventoRevision[]; gastos: Gasto[]; facturas: Factura[] };

// «Revisar emparejamiento»: lo que parece mal asignado, con botones para arreglarlo en un clic
export function RevisarEmparejamiento() {
  const soloLectura = useSoloLectura();
  const listas = useListas();
  const hoy = hoyMadrid();
  const [abierto, setAbierto] = useState(false);
  const [montaje, setMontaje] = useState<string | null>(null);
  const { datos } = useTablaEnVivo<Datos>(["eventos", "facturas", "facturas_recibidas"], async (sb) => {
    const [e, g, f] = await Promise.all([
      sb.from("eventos").select("id, estado, fecha_inicio, es_larga_duracion, montaje_revisado, cliente:clientes(nombre)").is("deleted_at", null),
      sb.from("facturas_recibidas").select("id, evento_id, categoria, fecha, base, numero, proveedor:proveedores(nombre)").is("deleted_at", null),
      sb.from("facturas").select("id, evento_id, estado, fecha_emision, codigo, importe, fact_nombre").is("deleted_at", null),
    ]);
    for (const r of [e, g, f]) if (r.error) throw new Error(r.error.message);
    return [{
      eventos: (e.data ?? []).map((x) => ({ ...x, cliente: (uno(x.cliente) as { nombre: string } | null)?.nombre ?? "Evento" })),
      gastos: (g.data ?? []).map((x) => ({ ...x, base: Number(x.base), proveedor: (uno(x.proveedor) as { nombre: string } | null)?.nombre ?? null })),
      facturas: (f.data ?? []).map((x) => ({ ...x, importe: Number(x.importe) })),
    }];
  });
  const d = datos[0];
  const deEvento = useMemo(() => new Set(listas.categoriasGasto.filter((c) => c.tipo === "variable").map((c) => c.codigo)), [listas.categoriasGasto]);
  const r = useMemo(() => d && porRevisar(hoy, d.eventos, d.gastos, d.facturas, deEvento), [d, hoy, deEvento]);
  if (!d || !r || soloLectura) return null;
  const total = r.gastosSinEvento.length + r.facturasSinEvento.length + r.eventosSinMontaje.length;

  async function asignar(tabla: "facturas" | "facturas_recibidas", id: string, eventoId: string) {
    if (!eventoId) return;
    const { error } = await crearClienteNavegador().from(tabla).update({ evento_id: eventoId }).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Asignado ✓");
  }
  async function sinMontaje(id: string) {
    const { error } = await crearClienteNavegador().from("eventos").update({ montaje_revisado: true }).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Anotado ✓");
  }
  const elegir = (fecha: string, alElegir: (id: string) => void) => (
    <select aria-label="Evento" className={cn(claseSelect, "w-auto max-w-64 bg-card")} defaultValue="" onChange={(e) => alElegir(e.target.value)}>
      <option value="" disabled>¿De qué evento es?</option>
      {eventosCercanos(fecha, d.eventos).slice(0, 12).map((e) => (
        <option key={e.id} value={e.id}>{e.fecha_inicio ? formatoFecha(e.fecha_inicio) : "Sin fecha"} · {e.cliente}</option>
      ))}
    </select>
  );

  if (total === 0) return <p className="mb-6 rounded-xl border bg-card px-4 py-3 text-sm text-[#25683D]">✓ Todos los gastos y facturas están con su evento.</p>;
  return (
    <section className="mb-6 rounded-xl border border-[#F2D7A6] bg-[#FDF8EE]">
      <button type="button" aria-expanded={abierto} onClick={() => setAbierto(!abierto)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm">
        <ChevronDown className={cn("size-4 transition-transform", !abierto && "-rotate-90")} aria-hidden />
        <span className="flex-1 font-semibold">Revisar emparejamiento · {total} {total === 1 ? "cosa" : "cosas"}</span>
        <span className="text-xs text-muted-foreground">gastos y facturas que quizá no están con su evento</span>
      </button>
      {abierto && (
        <div className="grid gap-4 border-t border-[#F2D7A6] px-4 py-3 text-[13px]">
          {r.gastosSinEvento.length > 0 && (
            <div>
              <h3 className="mb-1.5 font-semibold">Gastos de evento apuntados como gasto general</h3>
              <ul className="grid gap-1.5">
                {r.gastosSinEvento.map((g) => {
                  const x = d.gastos.find((y) => y.id === g.id)!;
                  return (
                    <li key={g.id} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-[1_1_220px]">{[x.proveedor, x.numero && `nº ${x.numero}`].filter(Boolean).join(" ")} · {nombreDe(listas.categoriasGasto, x.categoria)}
                        <span className="text-muted-foreground"> · {formatoFecha(x.fecha)} · {formatoEuros(x.base)}</span></span>
                      {elegir(x.fecha, (id) => void asignar("facturas_recibidas", x.id, id))}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {r.facturasSinEvento.length > 0 && (
            <div>
              <h3 className="mb-1.5 font-semibold">Facturas emitidas sin evento</h3>
              <ul className="grid gap-1.5">
                {r.facturasSinEvento.map((f) => {
                  const x = d.facturas.find((y) => y.id === f.id)!;
                  return (
                    <li key={f.id} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-[1_1_220px]">{x.codigo} · {x.fact_nombre}<span className="text-muted-foreground"> · {x.fecha_emision && formatoFecha(x.fecha_emision)} · {formatoEuros(x.importe)}</span></span>
                      {elegir(x.fecha_emision ?? hoy, (id) => void asignar("facturas", x.id, id))}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {r.eventosSinMontaje.length > 0 && (
            <div>
              <h3 className="mb-1.5 font-semibold">Eventos ya hechos sin factura de montadores</h3>
              <ul className="grid gap-1.5">
                {r.eventosSinMontaje.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-[1_1_220px]">{e.cliente}<span className="text-muted-foreground"> · {e.fecha_inicio && formatoFecha(e.fecha_inicio)}</span></span>
                    <Button size="sm" variant="outline" onClick={() => setMontaje(e.id)}>Apuntar la factura</Button>
                    <Button size="sm" variant="ghost" onClick={() => void sinMontaje(e.id)}>Lo montamos nosotros</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {montaje && <DialogoGasto eventoId={montaje} cerrar={() => setMontaje(null)} />}
    </section>
  );
}
