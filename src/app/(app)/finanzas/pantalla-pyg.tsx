"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Cabecera } from "@/components/cabecera";
import { Campo } from "@/components/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useListas } from "@/hooks/use-listas";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { uno } from "@/lib/datos/tipos";
import { formatoEuros, formatoFecha, hoyMadrid, leerEuros } from "@/lib/formato";
import { calcularPyg, cuotaActivo, type Activo, type EventoPyg, type Fila, type GastoPyg, type Manual } from "@/lib/pyg";
import type { FacturaRentabilidad } from "@/lib/rentabilidad";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { COLOR, GraficoBeneficio, GraficoIngresosGastos, Ranking } from "./graficos";
import { PestanasFinanzas } from "./pestanas";

type ActivoFila = Activo & { factura_recibida_id: string | null; notas: string | null };
type Datos = { eventos: EventoPyg[]; gastos: GastoPyg[]; facturas: FacturaRentabilidad[]; activos: ActivoFila[]; manual: Manual[] };
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const euros = (n: number) => (n ? formatoEuros(Math.round(n)) : "—");
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");

function usePyg() {
  const { datos, cargando } = useTablaEnVivo<Datos>(["eventos", "presupuestos", "facturas", "facturas_recibidas", "activos", "pyg_manual"], async (sb) => {
    const [e, g, f, a, m] = await Promise.all([
      sb.from("eventos").select("id, estado, fecha_precision, fecha_inicio, importe, importe_retenido, es_larga_duracion, tipo_evento, presupuesto:presupuestos(comision_pct, intermediario_id)").is("deleted_at", null),
      sb.from("facturas_recibidas").select("evento_id, base, fecha, categoria").is("deleted_at", null),
      sb.from("facturas").select("evento_id, importe, estado, fecha_emision").is("deleted_at", null),
      sb.from("activos").select("id, nombre, coste, vida_anios, fecha_compra, cuota_manual, factura_recibida_id, notas").order("fecha_compra"),
      sb.from("pyg_manual").select("mes, concepto, importe"),
    ]);
    for (const r of [e, g, f, a, m]) if (r.error) throw new Error(r.error.message);
    return [{
      eventos: (e.data ?? []).map((x) => {
        const p = uno(x.presupuesto) as { comision_pct: number | null; intermediario_id: string | null } | null;
        return {
          id: x.id, cliente: "", estado: x.estado, fecha_precision: x.fecha_precision, fecha_inicio: x.fecha_inicio, tipo_evento: x.tipo_evento,
          importe: x.importe !== null ? Number(x.importe) : null, importe_retenido: x.importe_retenido !== null ? Number(x.importe_retenido) : null,
          es_larga_duracion: x.es_larga_duracion, comision_pct: p?.intermediario_id && p.comision_pct ? Number(p.comision_pct) : null,
        };
      }),
      gastos: (g.data ?? []).map((x) => ({ ...x, base: Number(x.base) })),
      facturas: (f.data ?? []).map((x) => ({ ...x, importe: Number(x.importe) })),
      activos: (a.data ?? []).map((x) => ({ ...x, coste: Number(x.coste), cuota_manual: x.cuota_manual === null ? null : Number(x.cuota_manual) })),
      manual: (m.data ?? []).map((x) => ({ ...x, importe: Number(x.importe) })) as Manual[],
    }];
  });
  return { datos: datos[0], cargando };
}

// P&L del año, como la hoja del Excel contable: mes a mes y total
export function PantallaPyg({ esAdmin }: { esAdmin: boolean }) {
  const listas = useListas();
  const [anio, setAnio] = useState(Number(hoyMadrid().slice(0, 4)));
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set(["ingresos"]));
  const [activo, setActivo] = useState<ActivoFila | "nuevo" | null>(null);
  const { datos, cargando } = usePyg();

  const p = useMemo(() => datos && calcularPyg(anio, datos.eventos, datos.gastos, datos.facturas, datos.activos, datos.manual, {
    tiposEvento: new Map(listas.tiposEvento.map((t) => [t.codigo, t.nombre])),
    categorias: new Map(listas.categoriasGasto.map((c) => [c.codigo, { nombre: c.nombre, tipo: c.tipo ?? "fijo" }])),
  }), [anio, datos, listas]);
  const gastosMes = p ? p.variables.meses.map((x, i) => x + p.fijos.meses[i] + p.personal.meses[i]) : [];
  // Todos los costes del año en una lista: los 7 mayores y el resto junto
  const enQueSeVa = useMemo(() => {
    if (!p) return [];
    const todas = [...p.porVariable, ...p.porFijo, p.director, p.bonus, p.amortizacion, p.intereses]
      .filter((f) => f.total > 0).map((f) => ({ nombre: f.clave === "director" ? "Sueldo del director" : f.nombre, total: f.total }))
      .sort((a, b) => b.total - a.total);
    const resto = todas.slice(7).reduce((s, f) => s + f.total, 0);
    return resto ? [...todas.slice(0, 7), { nombre: "Resto", total: resto }] : todas;
  }, [p]);
  const alternar = (k: string) => setAbiertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  async function guardarManual(concepto: Manual["concepto"], i: number, importe: number | null) {
    const sb = crearClienteNavegador();
    const mes = `${anio}-${String(i + 1).padStart(2, "0")}-01`;
    const { error } = importe
      ? await sb.from("pyg_manual").upsert({ mes, concepto, importe }, { onConflict: "mes,concepto" })
      : await sb.from("pyg_manual").delete().eq("mes", mes).eq("concepto", concepto);
    if (error) toast.error(error.message);
  }

  // Funciones (no componentes) para que las celdas en edición no se reinicien al recargar
  const linea = ({ f, nivel = 0, fuerte, desplegable, editable, base }: {
    f: Fila; nivel?: 0 | 1; fuerte?: boolean; desplegable?: boolean; editable?: Manual["concepto"]; base?: Fila;
  }) => (
    <tr key={f.clave} className={cn("border-t", fuerte && "bg-muted/40 font-semibold", nivel === 1 && "text-muted-foreground")}>
      <th scope="row" className={cn("sticky left-0 z-10 min-w-48 py-1.5 pr-3 text-left font-[inherit] whitespace-nowrap", fuerte ? "bg-[#f7f7f6]" : "bg-card", nivel === 1 ? "pl-7" : "pl-3")}>
        {desplegable ? (
          <button type="button" onClick={() => alternar(f.clave)} className="inline-flex items-center gap-1" aria-expanded={abiertos.has(f.clave)}>
            <ChevronDown className={cn("size-3.5 transition-transform", !abiertos.has(f.clave) && "-rotate-90")} aria-hidden />{f.nombre}
          </button>
        ) : f.nombre}
        {base && <span className="ml-2 text-xs font-normal text-muted-foreground">{pct(f.total, base.total)}</span>}
      </th>
      {f.meses.map((x, i) => (
        <td key={i} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
          {editable && esAdmin
            ? <CeldaEditable valor={x} guardar={(v) => guardarManual(editable, i, v)} />
            : <span className={cn(x < 0 && "text-[#B42318]")}>{euros(x)}</span>}
        </td>
      ))}
      <td className={cn("px-3 py-1.5 text-right font-medium tabular-nums whitespace-nowrap", f.total < 0 && "text-[#B42318]")}>{euros(f.total)}</td>
    </tr>
  );
  const grupo = (total: Fila, detalle: Fila[]) => [
    linea({ f: total, fuerte: true, desplegable: detalle.length > 0 }),
    ...(abiertos.has(total.clave) ? detalle.map((f) => linea({ f: { ...f, clave: `${total.clave}-${f.clave}` }, nivel: 1 })) : []),
  ];

  return (
    <>
      <Cabecera titulo="Finanzas" subtitulo="Cuenta de pérdidas y ganancias por fecha de factura, mes a mes (sin IVA)">
        <div className="inline-flex items-center gap-1 rounded-lg border bg-card text-sm">
          <Button variant="ghost" size="sm" aria-label="Año anterior" onClick={() => setAnio(anio - 1)}><ChevronLeft className="size-4" /></Button>
          <span className="px-1 font-medium">{anio}</span>
          <Button variant="ghost" size="sm" aria-label="Año siguiente" onClick={() => setAnio(anio + 1)}><ChevronRight className="size-4" /></Button>
        </div>
      </Cabecera>
      <PestanasFinanzas activa="pyg" />

      {p && (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-4">
            {([["Ingresos", p.ingresos, null], ["Margen bruto", p.margenBruto, p.ingresos], ["EBITDA", p.ebitda, p.ingresos], ["Beneficio neto", p.neto, p.ingresos]] as const).map(([t, f, b]) => (
              <div key={t} className="rounded-xl border bg-card p-4">
                <div className="text-xs text-muted-foreground">{t} {anio}</div>
                <div className={cn("text-xl font-semibold", f.total < 0 && "text-[#B42318]")}>{formatoEuros(Math.round(f.total))}</div>
                <div className="text-xs text-muted-foreground">{b ? `${pct(f.total, b.total)} de los ingresos` : `${p.porTipo.length} tipos de evento`}</div>
              </div>
            ))}
          </div>

          <div className="mb-5 grid gap-3 lg:grid-cols-2">
            <GraficoIngresosGastos ingresos={p.ingresos.meses} gastos={gastosMes}
              detalle={(i) => [["Ingresos", p.ingresos.meses[i]], ["Costes variables", p.variables.meses[i]], ["Costes fijos", p.fijos.meses[i]], ["Personal", p.personal.meses[i]], ["EBITDA", p.ebitda.meses[i]]]} />
            <GraficoBeneficio neto={p.neto.meses} />
            <Ranking titulo="¿En qué se va el dinero?" subtitulo={`${anio} · sin IVA`} color={COLOR.gastos} filas={enQueSeVa} total={enQueSeVa.reduce((s, f) => s + f.total, 0)} />
            <Ranking titulo="¿De dónde viene?" subtitulo="facturado por tipo de evento" color={COLOR.ingresos} filas={p.porTipo} total={p.ingresos.total} />
          </div>

          <h2 className="mb-2 text-sm font-semibold">Detalle mes a mes</h2>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-card py-2 pl-3 text-left font-medium">{anio}</th>
                  {MESES.map((m) => <th key={m} className="px-2 py-2 text-right font-medium">{m}</th>)}
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {grupo(p.ingresos, p.porTipo)}
                {grupo(p.variables, p.porVariable)}
                {linea({ f: p.margenBruto, fuerte: true, base: p.ingresos })}
                {grupo(p.fijos, p.porFijo)}
                {linea({ f: p.personal, fuerte: true })}
                {linea({ f: p.director, nivel: 1 })}
                {linea({ f: p.bonus, nivel: 1, editable: "bonus" })}
                {linea({ f: p.ebitda, fuerte: true, base: p.ingresos })}
                {linea({ f: p.amortizacion })}
                {linea({ f: p.ebit, fuerte: true })}
                {linea({ f: p.intereses, editable: "intereses" })}
                {linea({ f: p.ebt, fuerte: true })}
                {linea({ f: p.impuesto })}
                {linea({ f: p.neto, fuerte: true, base: p.ingresos })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Cada factura cuenta en el mes de su fecha: lo facturado a clientes como ingreso y lo que nos facturan como coste, sea cuando sea el evento.
            El impuesto se calcula sobre lo acumulado en el año (un mes con pérdidas compensa los siguientes).
            {" El sueldo del director sale de las facturas de Maketa."}{esAdmin && " Bonus e intereses: pulsa en la celda para escribirlos."}
          </p>

          <section className="mt-8">
            <div className="mb-3 flex items-end gap-3">
              <div className="flex-1">
                <h2 className="font-semibold">Equipos (CAPEX)</h2>
                <p className="text-sm text-muted-foreground">Lo que se amortiza. Las facturas de «Material de carpas (inversión)» entran solas.</p>
              </div>
              {esAdmin && <Button variant="outline" onClick={() => setActivo("nuevo")}><Plus className="size-4" aria-hidden /> Equipo</Button>}
            </div>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 pl-3 font-medium">Equipo</th><th className="px-2 text-right font-medium">Coste</th>
                    <th className="px-2 text-right font-medium">Vida</th><th className="px-2 font-medium">Compra</th>
                    <th className="px-2 text-right font-medium">€/mes</th><th className="px-3 text-right font-medium">En {anio}</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.activos.map((a) => {
                    const enAnio = MESES.reduce((s, _, i) => s + cuotaActivo(a, `${anio}-${String(i + 1).padStart(2, "0")}`), 0);
                    return (
                      <tr key={a.id} className={cn("border-t", esAdmin && "cursor-pointer hover:bg-muted/40")} onClick={() => esAdmin && setActivo(a)}>
                        <td className="py-1.5 pl-3">{a.nombre}{a.factura_recibida_id && <span className="ml-2 text-xs text-muted-foreground">factura</span>}</td>
                        <td className="px-2 text-right tabular-nums">{formatoEuros(a.coste)}</td>
                        <td className="px-2 text-right">{a.vida_anios} años</td>
                        <td className="px-2 whitespace-nowrap">{formatoFecha(a.fecha_compra)}</td>
                        <td className="px-2 text-right tabular-nums">{formatoEuros(Math.round((a.cuota_manual ?? a.coste / a.vida_anios / 12) * 100) / 100)}{a.cuota_manual !== null && " *"}</td>
                        <td className="px-3 text-right tabular-nums">{euros(enAnio)}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t bg-muted/40 font-semibold">
                    <td className="py-1.5 pl-3">Total</td>
                    <td className="px-2 text-right tabular-nums">{formatoEuros(datos.activos.reduce((s, a) => s + a.coste, 0))}</td>
                    <td colSpan={3} />
                    <td className="px-3 text-right tabular-nums">{euros(p.amortizacion.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">* Cuota confirmada por la gestoría en lugar de la calculada.</p>
          </section>
        </>
      )}
      {!p && cargando && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {activo && <DialogoActivo activo={activo === "nuevo" ? null : activo} cerrar={() => setActivo(null)} />}
    </>
  );
}

// Celda que se edita al pulsarla (sueldo, bonus, intereses)
function CeldaEditable({ valor, guardar }: { valor: number; guardar: (v: number | null) => Promise<void> }) {
  const [texto, setTexto] = useState<string | null>(null);
  if (texto === null) {
    return <button type="button" onClick={() => setTexto(valor ? String(valor).replace(".", ",") : "")} className="w-full rounded px-1 text-right text-[#1D4ED8] hover:bg-[#EEF4FF]">{euros(valor)}</button>;
  }
  const terminar = async () => {
    const v = texto.trim() ? leerEuros(texto) : null;
    setTexto(null);
    if (v !== valor && !(v === null && !valor)) await guardar(v);
  };
  return (
    <input autoFocus value={texto} inputMode="decimal" aria-label="Importe" onChange={(e) => setTexto(e.target.value)} onBlur={() => void terminar()}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setTexto(null); }}
      className="w-20 rounded border px-1 text-right" />
  );
}

function DialogoActivo({ activo, cerrar }: { activo: ActivoFila | null; cerrar: () => void }) {
  const [c, setC] = useState({
    nombre: activo?.nombre ?? "",
    coste: activo ? String(activo.coste).replace(".", ",") : "",
    vida: String(activo?.vida_anios ?? 10),
    fecha: activo?.fecha_compra ?? hoyMadrid(),
    cuota: activo?.cuota_manual !== null && activo?.cuota_manual !== undefined ? String(activo.cuota_manual).replace(".", ",") : "",
    notas: activo?.notas ?? "",
  });
  const set = (k: keyof typeof c, v: string) => setC((x) => ({ ...x, [k]: v }));
  const deFactura = Boolean(activo?.factura_recibida_id);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const coste = leerEuros(c.coste);
    if (!c.nombre.trim() || coste === null) return toast.error("Escribe el nombre y el coste");
    const fila = {
      nombre: c.nombre.trim(), vida_anios: Math.max(1, Number(c.vida) || 10),
      cuota_manual: c.cuota.trim() ? leerEuros(c.cuota) : null, notas: c.notas.trim() || null,
      // El coste y la fecha de los que vienen de una factura los manda la factura
      ...(deFactura ? {} : { coste, fecha_compra: c.fecha }),
    };
    const sb = crearClienteNavegador();
    const { error } = activo ? await sb.from("activos").update(fila).eq("id", activo.id) : await sb.from("activos").insert(fila);
    if (error) return toast.error(error.message);
    toast.success("Guardado ✓");
    cerrar();
  }

  async function borrar() {
    if (!activo || !window.confirm(`¿Quitar «${activo.nombre}» del CAPEX? Deja de amortizarse.`)) return;
    const { error } = await crearClienteNavegador().from("activos").delete().eq("id", activo.id);
    if (error) return toast.error(error.message);
    cerrar();
  }

  return (
    <Dialog open onOpenChange={(a) => !a && cerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{activo ? "Equipo" : "Nuevo equipo"}</DialogTitle>
          <DialogDescription>{deFactura ? "Viene de una factura recibida: el coste y la fecha se cambian en la factura." : "Se amortiza desde su mes de compra."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="grid gap-3">
          <Campo id="ac-nombre" etiqueta="Equipo"><Input id="ac-nombre" value={c.nombre} onChange={(e) => set("nombre", e.target.value)} /></Campo>
          <div className="grid grid-cols-3 gap-3">
            <Campo id="ac-coste" etiqueta="Coste (sin IVA)"><Input id="ac-coste" value={c.coste} disabled={deFactura} onChange={(e) => set("coste", e.target.value)} /></Campo>
            <Campo id="ac-vida" etiqueta="Vida (años)"><Input id="ac-vida" type="number" min={1} value={c.vida} onChange={(e) => set("vida", e.target.value)} /></Campo>
            <Campo id="ac-fecha" etiqueta="Compra"><Input id="ac-fecha" type="date" value={c.fecha} disabled={deFactura} onChange={(e) => set("fecha", e.target.value)} /></Campo>
          </div>
          <Campo id="ac-cuota" etiqueta="Cuota mensual de la gestoría (opcional)">
            <Input id="ac-cuota" value={c.cuota} onChange={(e) => set("cuota", e.target.value)} placeholder="Vacío = coste ÷ vida ÷ 12" />
          </Campo>
          <Campo id="ac-notas" etiqueta="Factura o notas"><Input id="ac-notas" value={c.notas} onChange={(e) => set("notas", e.target.value)} /></Campo>
          <DialogFooter className="gap-2">
            {activo && !deFactura && <Button type="button" variant="ghost" className="mr-auto text-[#B42318]" onClick={() => void borrar()}>Quitar</Button>}
            <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
            <Button type="submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

