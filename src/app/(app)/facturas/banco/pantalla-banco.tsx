"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Cabecera } from "@/components/cabecera";
import { Campo, claseSelect } from "@/components/campo";
import { EstadoVacio } from "@/components/estado-vacio";
import { Etiqueta } from "@/components/etiqueta-estado";
import { useEventosOpciones, useProveedores } from "@/components/gastos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { nombreDe, useListas } from "@/hooks/use-listas";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { patronSugerido, proponer, type EmitidaC, type Propuesta, type RecibidaC, type ReglaC } from "@/lib/conciliacion";
import { SELECT_FACTURA_RECIBIDA, aFacturaRecibida, uno } from "@/lib/datos/tipos";
import { totalFactura } from "@/lib/facturacion";
import { formatoEuros, formatoFecha } from "@/lib/formato";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { PestanasFacturas } from "../pestanas";

type MovimientoBanco = {
  id: string; fecha: string; concepto: string; importe: number; saldo: number | null;
  estado: "pendiente" | "conciliado" | "ignorado"; factura_id: string | null; factura_recibida_id: string | null; notas: string | null;
};
type Datos = { movimientos: MovimientoBanco[]; emitidas: EmitidaC[]; recibidas: RecibidaC[]; reglas: ReglaC[] };

const FILTROS = [["pendiente", "Por revisar"], ["conciliado", "Conciliados"], ["ignorado", "Ignorados"], ["todos", "Todos"]] as const;

// Banco: se sube el extracto del Santander y cada movimiento se enlaza con su factura
// (cobro de una emitida o pago de una recibida), se apunta como gasto o se ignora.
export function PantallaBanco() {
  const listas = useListas();
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number][0]>("pendiente");
  const [subiendo, setSubiendo] = useState(false);
  const [gasto, setGasto] = useState<{ m: MovimientoBanco; regla?: ReglaC } | null>(null);
  const [enlazar, setEnlazar] = useState<MovimientoBanco | null>(null);
  const ficheroRef = useRef<HTMLInputElement>(null);
  const sb = crearClienteNavegador();

  const { datos, cargando } = useTablaEnVivo<Datos>(["movimientos_banco", "reglas_banco", "facturas", "facturas_recibidas"], async (sb) => {
    const [m, e, r, g] = await Promise.all([
      sb.from("movimientos_banco").select("id, fecha, concepto, importe, saldo, estado, factura_id, factura_recibida_id, notas")
        .order("fecha", { ascending: false }).order("created_at", { ascending: false }),
      sb.from("facturas").select("id, codigo, anio, numero, importe, iva_pct, suplidos, estado, fact_nombre, cliente:clientes(nombre)")
        .is("deleted_at", null).neq("estado", "prevista"),
      sb.from("facturas_recibidas").select(SELECT_FACTURA_RECIBIDA).is("deleted_at", null),
      sb.from("reglas_banco").select("id, patron, categoria, proveedor_id, ignorar").order("created_at"),
    ]);
    const error = m.error ?? e.error ?? r.error ?? g.error;
    if (error) throw new Error(error.message);
    return [{
      movimientos: (m.data ?? []).map((x) => ({ ...x, importe: Number(x.importe), saldo: x.saldo === null ? null : Number(x.saldo) })) as MovimientoBanco[],
      emitidas: (e.data ?? []).map((f) => ({
        id: f.id, codigo: f.codigo, anio: f.anio, numero: f.numero, estado: f.estado,
        total: totalFactura({ importe: Number(f.importe), iva_pct: Number(f.iva_pct), suplidos: Number(f.suplidos) }).total,
        cliente: f.fact_nombre ?? (uno(f.cliente) as { nombre: string } | null)?.nombre ?? null,
      })),
      recibidas: (r.data ?? []).map(aFacturaRecibida).map((f) => ({
        id: f.id, numero: f.numero, total: f.total, estado: f.estado, proveedor: f.proveedor?.nombre ?? null, fecha: f.fecha,
      })),
      reglas: (g.data ?? []) as ReglaC[],
    }];
  });
  const { movimientos = [], emitidas = [], recibidas = [], reglas = [] } = datos[0] ?? {};

  // Propuesta de cada movimiento por revisar. Del más antiguo al más nuevo, sin repetir factura.
  const propuestas = useMemo(() => {
    const usadas = new Set(movimientos.flatMap((m) => [m.factura_id, m.factura_recibida_id].filter((x): x is string => Boolean(x))));
    const res = new Map<string, Propuesta>();
    for (const m of [...movimientos].reverse().filter((x) => x.estado === "pendiente")) {
      const p = proponer(m, emitidas, recibidas, reglas, usadas);
      if (p?.tipo === "cobro") usadas.add(p.factura.id);
      if (p?.tipo === "pago") usadas.add(p.recibida.id);
      res.set(m.id, p);
    }
    return res;
  }, [movimientos, emitidas, recibidas, reglas]);

  const lista = movimientos.filter((m) => filtro === "todos" || m.estado === filtro);
  const pendientes = movimientos.filter((m) => m.estado === "pendiente");
  const ultimo = movimientos.find((m) => m.saldo !== null);
  const textoFactura = (m: MovimientoBanco) => {
    if (m.factura_id) {
      const f = emitidas.find((x) => x.id === m.factura_id);
      return f ? `Cobro ${f.codigo} · ${f.cliente ?? ""}` : "Cobro de factura";
    }
    if (m.factura_recibida_id) {
      const f = recibidas.find((x) => x.id === m.factura_recibida_id);
      return f ? `Pago a ${f.proveedor ?? "proveedor"}${f.numero ? ` · nº ${f.numero}` : ""}` : "Pago de factura";
    }
    return m.notas ?? "";
  };

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    setSubiendo(true);
    try {
      const datos = new FormData();
      datos.append("archivo", archivo);
      const r = await fetch("/api/banco/importar", { method: "POST", body: datos });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "No se pudo leer el fichero");
      toast.success(j.nuevos
        ? `${j.nuevos} movimientos nuevos (del ${formatoFecha(j.desde)} al ${formatoFecha(j.hasta)})${j.leidos > j.nuevos ? ` · ${j.leidos - j.nuevos} ya estaban` : ""}`
        : "Todos los movimientos de este fichero ya estaban subidos");
      setFiltro("pendiente");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setSubiendo(false);
      if (ficheroRef.current) ficheroRef.current.value = "";
    }
  }

  // Enlaza el movimiento con una factura y la marca como cobrada/pagada en la fecha del banco
  async function conciliarCobro(m: MovimientoBanco, f: EmitidaC) {
    if (f.estado === "emitida") {
      const { error } = await sb.rpc("marcar_factura_pagada", { p_id: f.id, p_fecha: m.fecha });
      if (error) return toast.error(error.message);
    }
    const { error } = await sb.from("movimientos_banco").update({ estado: "conciliado", factura_id: f.id }).eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success(f.estado === "emitida" ? `${f.codigo} cobrada ✓` : `Enlazado con ${f.codigo} ✓`);
  }

  async function conciliarPago(m: MovimientoBanco, f: RecibidaC) {
    if (f.estado === "pendiente") {
      const { error } = await sb.from("facturas_recibidas").update({ estado: "pagada", fecha_pago: m.fecha }).eq("id", f.id);
      if (error) return toast.error(error.message);
    }
    const { error } = await sb.from("movimientos_banco").update({ estado: "conciliado", factura_recibida_id: f.id }).eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success(f.estado === "pendiente" ? "Factura pagada ✓" : "Enlazado ✓");
  }

  async function cambiarEstado(m: MovimientoBanco, estado: MovimientoBanco["estado"]) {
    const cambios = estado === "pendiente" ? { estado, factura_id: null, factura_recibida_id: null, notas: null } : { estado };
    const { error } = await sb.from("movimientos_banco").update(cambios).eq("id", m.id);
    if (error) return toast.error(error.message);
    if (estado === "pendiente" && (m.factura_id || m.factura_recibida_id)) toast.info("Desenlazado. La factura sigue marcada como pagada: cámbialo en la factura si no lo está.");
  }

  return (
    <>
      <Cabecera titulo="Facturas" subtitulo="Los movimientos del banco, enlazados con sus facturas">
        <input ref={ficheroRef} type="file" className="hidden" accept=".n43,.q43,.aeb,.txt,.csv,.xlsx,.xls"
          onChange={(e) => void subir(e.target.files?.[0])} />
        <Button disabled={subiendo} onClick={() => ficheroRef.current?.click()}>
          <Upload className="size-4" aria-hidden /> {subiendo ? "Leyendo…" : "Subir extracto"}
        </Button>
      </Cabecera>
      <PestanasFacturas activa="banco" />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <button type="button" onClick={() => setFiltro("pendiente")} className="rounded-xl border bg-card p-4 text-left hover:bg-muted/40">
          <div className="text-xs text-muted-foreground">Por revisar</div>
          <div className="text-xl font-semibold">{pendientes.length}</div>
          <div className="text-xs text-muted-foreground">{pendientes.filter((m) => propuestas.get(m.id)).length} con propuesta</div>
        </button>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Saldo según el último extracto</div>
          <div className="text-xl font-semibold">{ultimo ? formatoEuros(ultimo.saldo) : "—"}</div>
          <div className="text-xs text-muted-foreground">{ultimo ? `a ${formatoFecha(ultimo.fecha)}` : "Sube un extracto"}</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">
          En Santander Empresas: <b>Cuentas → Movimientos → Descargar</b>, en <b>Norma 43</b> o Excel. Puedes subir el mismo periodo
          dos veces: los movimientos repetidos no se duplican.
        </div>
      </div>

      <div role="group" aria-label="Qué movimientos" className="mb-4 inline-flex overflow-hidden rounded-lg border text-sm">
        {FILTROS.map(([v, t]) => (
          <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)}
            className={cn("px-3 py-1.5", filtro === v ? "bg-foreground text-background" : "bg-card")}>{t}</button>
        ))}
      </div>

      {!cargando && lista.length === 0 && (
        <EstadoVacio titulo={movimientos.length ? "No hay nada por revisar" : "Todavía no has subido ningún extracto"}
          texto="Descarga los movimientos del Santander y súbelos aquí: el CRM te propone con qué factura va cada uno.">
          <Button onClick={() => ficheroRef.current?.click()}>Subir extracto</Button>
        </EstadoVacio>
      )}
      {lista.length > 0 && (
        <ul className="rounded-xl border bg-card px-4 md:px-5">
          {lista.map((m) => {
            const p = propuestas.get(m.id) ?? null;
            const regla = p?.tipo === "regla" ? p.regla : undefined;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t py-3 text-sm first:border-t-0">
                <div className="min-w-0 flex-[1_1_260px]">
                  <div className="break-words">{m.concepto}</div>
                  <div className="text-[13px] text-muted-foreground">
                    {formatoFecha(m.fecha)}
                    {m.estado === "conciliado" && <> · <span className="text-[#25683D]">{textoFactura(m)}</span></>}
                    {m.estado === "ignorado" && " · Ignorado"}
                  </div>
                </div>
                <div className={cn("w-24 text-right font-medium tabular-nums", m.importe > 0 && "text-[#25683D]")}>
                  {m.importe > 0 ? "+" : ""}{formatoEuros(m.importe)}
                </div>

                {m.estado === "pendiente" ? (
                  <div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto">
                    {p?.tipo === "cobro" && (
                      <Propuesto seguro={p.seguro} texto={`Cobro ${p.factura.codigo} · ${p.factura.cliente ?? ""}`} confirmar={() => conciliarCobro(m, p.factura)} />
                    )}
                    {p?.tipo === "pago" && (
                      <Propuesto seguro={p.seguro} texto={`Factura de ${p.recibida.proveedor ?? "proveedor"}${p.recibida.numero ? ` nº ${p.recibida.numero}` : ""}`}
                        confirmar={() => conciliarPago(m, p.recibida)} />
                    )}
                    {regla && (regla.ignorar
                      ? <Propuesto seguro texto="Regla: se ignora" confirmar={() => cambiarEstado(m, "ignorado")} />
                      : <Propuesto seguro texto={nombreDe(listas.categoriasGasto, regla.categoria)} accion="Apuntar" confirmar={() => setGasto({ m, regla })} />)}
                    <Button size="sm" variant="outline" onClick={() => setEnlazar(m)}>Elegir factura</Button>
                    {m.importe < 0 && !regla && <Button size="sm" variant="outline" onClick={() => setGasto({ m })}>Apuntar gasto</Button>}
                    <Button size="sm" variant="ghost" onClick={() => cambiarEstado(m, "ignorado")}>Ignorar</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => cambiarEstado(m, "pendiente")}>
                    {m.estado === "ignorado" ? "Recuperar" : "Deshacer"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {gasto && <DialogoGastoBanco m={gasto.m} regla={gasto.regla} cerrar={() => setGasto(null)} />}
      {enlazar && (
        <DialogoEnlazar m={enlazar} emitidas={emitidas} recibidas={recibidas}
          usadas={new Set(movimientos.flatMap((x) => [x.factura_id, x.factura_recibida_id].filter((y): y is string => Boolean(y))))}
          cerrar={() => setEnlazar(null)}
          elegir={async (f) => { setEnlazar(null); await ("codigo" in f ? conciliarCobro(enlazar, f) : conciliarPago(enlazar, f)); }} />
      )}
    </>
  );
}

function Propuesto({ texto, seguro, confirmar, accion = "Confirmar" }: { texto: string; seguro: boolean; confirmar: () => void; accion?: string }) {
  return (
    <span className="flex items-center gap-2">
      <Etiqueta className={seguro ? "bg-[#E8F4EC] text-[#25683D]" : "bg-[#FDF3E1] text-[#8A5A0B]"}>
        {seguro ? "" : "¿"}{texto}{seguro ? "" : "?"}
      </Etiqueta>
      <Button size="sm" variant={seguro ? "default" : "outline"} onClick={confirmar}>{accion}</Button>
    </span>
  );
}

// Elegir a mano la factura (las de importe más parecido, primero)
function DialogoEnlazar({ m, emitidas, recibidas, usadas, cerrar, elegir }: {
  m: { importe: number; concepto: string }; emitidas: EmitidaC[]; recibidas: RecibidaC[]; usadas: Set<string>;
  cerrar: () => void; elegir: (f: EmitidaC | RecibidaC) => void;
}) {
  const [todas, setTodas] = useState(false);
  const candidatas: (EmitidaC | RecibidaC)[] = (m.importe > 0 ? emitidas : recibidas)
    .filter((f) => !usadas.has(f.id) && (todas || f.estado === "emitida" || f.estado === "pendiente"))
    .sort((a, b) => Math.abs(a.total - Math.abs(m.importe)) - Math.abs(b.total - Math.abs(m.importe)))
    .slice(0, 30);
  return (
    <Dialog open onOpenChange={(a) => !a && cerrar()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.importe > 0 ? "¿Qué factura nos han pagado?" : "¿Qué factura hemos pagado?"}</DialogTitle>
          <DialogDescription>{m.concepto} · {formatoEuros(m.importe)}</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
          Ver también las ya marcadas como pagadas
        </label>
        {candidatas.length === 0 && <p className="text-sm text-muted-foreground">No hay facturas {m.importe > 0 ? "por cobrar" : "por pagar"}.</p>}
        <ul className="divide-y rounded-lg border">
          {candidatas.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => elegir(f)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{"codigo" in f ? f.codigo : f.proveedor ?? "Sin proveedor"}</span>
                  <span className="text-muted-foreground"> · {"codigo" in f ? f.cliente : `${f.numero ? `nº ${f.numero} · ` : ""}${formatoFecha(f.fecha)}`}</span>
                  {(f.estado === "pagada") && <span className="text-muted-foreground"> · ya pagada</span>}
                </span>
                <span className={cn("tabular-nums", Math.abs(f.total - Math.abs(m.importe)) < 0.01 && "font-medium text-[#25683D]")}>{formatoEuros(f.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// Un cargo sin factura en el CRM (recibos, tarjeta…) se apunta como gasto ya pagado
function DialogoGastoBanco({ m, regla, cerrar }: { m: { id: string; fecha: string; concepto: string; importe: number }; regla?: ReglaC; cerrar: () => void }) {
  const listas = useListas();
  const proveedores = useProveedores();
  const eventos = useEventosOpciones();
  const [c, setC] = useState({
    concepto: m.concepto,
    categoria: regla?.categoria ?? "",
    proveedor: regla?.proveedor_id ?? "",
    evento: "",
    iva: "21",
    recordar: !regla,
    patron: patronSugerido(m.concepto),
  });
  const set = <K extends keyof typeof c>(k: K, v: (typeof c)[K]) => setC((x) => ({ ...x, [k]: v }));
  const [guardando, setGuardando] = useState(false);
  const total = Math.abs(m.importe);
  const base = Math.round(total / (1 + (Number(c.iva) || 0) / 100) * 100) / 100;
  const tipo = c.evento ? "variable" : "fijo";
  const categorias = listas.categoriasGasto.filter((x) => x.tipo === tipo || x.codigo === c.categoria);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!c.categoria) return toast.error("Elige la categoría");
    setGuardando(true);
    try {
      const sb = crearClienteNavegador();
      const r = await sb.from("facturas_recibidas").insert({
        proveedor_id: c.proveedor || null, fecha: m.fecha, concepto: c.concepto.trim() || null, evento_id: c.evento || null,
        categoria: c.categoria, base, iva_pct: Number(c.iva) || 0, irpf_pct: 0,
        estado: "pagada", fecha_pago: m.fecha, comentarios: "Desde el banco",
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      const u = await sb.from("movimientos_banco").update({ estado: "conciliado", factura_recibida_id: r.data.id }).eq("id", m.id);
      if (u.error) throw new Error(u.error.message);
      if (c.recordar && c.patron.trim()) {
        const g = await sb.from("reglas_banco").insert({ patron: c.patron.trim(), categoria: c.categoria, proveedor_id: c.proveedor || null });
        if (g.error) throw new Error(g.error.message);
      }
      toast.success(c.recordar && c.patron.trim() ? `Apuntado ✓ · La próxima vez que aparezca "${c.patron.trim()}" te lo propongo` : "Apuntado ✓");
      cerrar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(a) => !a && cerrar()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apuntar como gasto</DialogTitle>
          <DialogDescription>{formatoFecha(m.fecha)} · {formatoEuros(total)} · queda como pagado</DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="grid gap-3">
          <Campo id="gb-concepto" etiqueta="Concepto">
            <Input id="gb-concepto" value={c.concepto} onChange={(e) => set("concepto", e.target.value)} />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="gb-evento" etiqueta="Evento (si es de uno)">
              <select id="gb-evento" className={claseSelect} value={c.evento} onChange={(e) => set("evento", e.target.value)}>
                <option value="">Gasto general</option>
                {eventos.map((ev) => <option key={ev.id} value={ev.id}>{ev.texto}</option>)}
              </select>
            </Campo>
            <Campo id="gb-categoria" etiqueta="Categoría">
              <select id="gb-categoria" className={claseSelect} value={c.categoria} onChange={(e) => set("categoria", e.target.value)}>
                <option value="">Elige…</option>
                {categorias.map((x) => <option key={x.codigo} value={x.codigo}>{x.nombre}</option>)}
              </select>
            </Campo>
            <Campo id="gb-proveedor" etiqueta="Proveedor (opcional)">
              <select id="gb-proveedor" className={claseSelect} value={c.proveedor} onChange={(e) => set("proveedor", e.target.value)}>
                <option value="">—</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </Campo>
            <Campo id="gb-iva" etiqueta="IVA incluido">
              <select id="gb-iva" className={claseSelect} value={c.iva} onChange={(e) => set("iva", e.target.value)}>
                {["21", "10", "4", "0"].map((v) => <option key={v} value={v}>{v} %</option>)}
              </select>
            </Campo>
          </div>
          <p className="text-xs text-muted-foreground">Base {formatoEuros(base)} + IVA {formatoEuros(Math.round((total - base) * 100) / 100)} = {formatoEuros(total)}</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={c.recordar} onChange={(e) => set("recordar", e.target.checked)} />
            Recordar: lo que lleve este texto en el concepto, proponerlo así
          </label>
          {c.recordar && (
            <Input aria-label="Texto a recordar" value={c.patron} onChange={(e) => set("patron", e.target.value)} placeholder="Ej.: MICROSOFT" />
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Apuntar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
