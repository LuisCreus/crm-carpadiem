"use client";

// Facturas recibidas (gastos): formulario, línea y acciones. Se usan en Facturas → Recibidas
// y en la ficha del evento.

import { useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Paperclip, X } from "lucide-react";
import { Autocompletar } from "@/components/autocompletar";
import { Campo, claseSelect } from "@/components/campo";
import { Etiqueta } from "@/components/etiqueta-estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { nombreDe, useListas } from "@/hooks/use-listas";
import { useCompartido } from "@/hooks/use-compartido";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { moverAPapelera } from "@/lib/datos/papelera";
import { uno, type FacturaRecibida, type Proveedor } from "@/lib/datos/tipos";
import { formatoEuros, formatoFecha, hoyMadrid, leerEuros } from "@/lib/formato";
import { totalRecibida } from "@/lib/gastos";
import { formatoIban, type DatosLeidos } from "@/lib/leer-factura";
import { eventosCercanos } from "@/lib/emparejamiento";
import { useUnaVez } from "@/hooks/use-una-vez";

type EventoOpcion = { id: string; texto: string; fecha_inicio: string | null; estado: string };

// Eventos para elegir a cuál va el gasto (los más recientes primero)
export function useEventosOpciones() {
  const { datos } = useCompartido<EventoOpcion[]>("eventos-opciones", ["eventos", "clientes"], async (sb) => {
    const { data, error } = await sb.from("eventos").select("id, fecha_inicio, estado, cliente:clientes(nombre)")
      .is("deleted_at", null).order("fecha_inicio", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((e) => ({
      id: e.id, fecha_inicio: e.fecha_inicio, estado: e.estado,
      texto: `${e.fecha_inicio ? formatoFecha(e.fecha_inicio) : "Sin fecha"} · ${(uno(e.cliente) as { nombre: string } | null)?.nombre ?? "Evento"}`,
    }));
  });
  return datos ?? [];
}

export function useProveedores() {
  const { datos } = useCompartido<Proveedor[]>("proveedores", ["proveedores"], async (sb) => {
    const { data, error } = await sb.from("proveedores").select("id, nombre, nif, iban, email, categoria").is("deleted_at", null).order("nombre");
    if (error) throw new Error(error.message);
    return (data ?? []) as Proveedor[];
  });
  return datos ?? [];
}

export function EtiquetaGasto({ g, hoy }: { g: Pick<FacturaRecibida, "estado" | "vencimiento" | "fichero_pago_at">; hoy: string }) {
  if (g.estado === "pagada") return <Etiqueta className="bg-[#E8F4EC] text-[#25683D]">Pagada</Etiqueta>;
  if (g.fichero_pago_at) return <Etiqueta className="bg-[#EEF4F7] text-[#2F5D70]">En fichero {formatoFecha(g.fichero_pago_at)}</Etiqueta>;
  if (g.vencimiento && g.vencimiento < hoy) return <Etiqueta className="bg-[#FDEDEC] text-[#B0302A]">Vencida</Etiqueta>;
  return <Etiqueta className="bg-[#FDF3E1] text-[#8A5A0B]">Por pagar</Etiqueta>;
}

// Añadir o editar una factura recibida (o un tique sin factura)
export function DialogoGasto({ cerrar, gasto, eventoId }: { cerrar: () => void; gasto?: FacturaRecibida; eventoId?: string }) {
  const listas = useListas();
  const proveedores = useProveedores();
  const eventos = useEventosOpciones();
  const archivoRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [c, setC] = useState({
    proveedor: gasto?.proveedor?.nombre ?? "",
    nif: gasto?.proveedor?.nif ?? "",
    iban: gasto?.iban ?? "",
    numero: gasto?.numero ?? "",
    fecha: gasto?.fecha ?? hoyMadrid(),
    vencimiento: gasto?.vencimiento ?? "",
    concepto: gasto?.concepto ?? "",
    evento: gasto ? gasto.evento_id ?? "" : eventoId ?? "",
    categoria: gasto?.categoria ?? "",
    base: gasto ? String(gasto.base).replace(".", ",") : "",
    iva: String(gasto?.iva_pct ?? 21),
    irpf: String(gasto?.irpf_pct ?? 0),
    comentarios: gasto?.comentarios ?? "",
  });
  const set = (k: keyof typeof c, v: string) => setC((x) => ({ ...x, [k]: v }));
  const [eventoTexto, setEventoTexto] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  // El concepto es lo que verá el proveedor en su banco: por defecto "Pago factura {nº}"
  const conceptoAuto = (numero: string) => (numero.trim() ? `Pago factura ${numero.trim()}` : "");
  function cambiarNumero(numero: string) {
    setC((x) => ({ ...x, numero, concepto: !x.concepto || x.concepto === conceptoAuto(x.numero) ? conceptoAuto(numero) : x.concepto }));
  }

  const existente = proveedores.find((p) => p.nombre.trim().toLowerCase() === c.proveedor.trim().toLowerCase());
  const tipo = c.evento ? "variable" : "fijo";
  // Los 3 eventos más cercanos a la fecha de la factura, para elegir con un toque
  const cercanos = useMemo(() => (c.evento || !c.fecha ? [] : eventosCercanos(c.fecha, eventos).filter((e) => e.fecha_inicio).slice(0, 3)), [c.evento, c.fecha, eventos]);
  const categorias = useMemo(() => listas.categoriasGasto.filter((x) => x.tipo === tipo), [listas.categoriasGasto, tipo]);
  const base = leerEuros(c.base);
  const total = base !== null ? totalRecibida(base, Number(c.iva) || 0, Number(c.irpf) || 0) : null;

  // Al elegir un proveedor guardado se rellenan su NIF, su IBAN y su categoría habitual
  function elegirProveedor(p: Proveedor) {
    setC((x) => ({ ...x, proveedor: p.nombre, nif: p.nif ?? x.nif, iban: p.iban ?? x.iban, categoria: x.categoria || p.categoria || "" }));
  }

  // Al adjuntar un PDF se leen sus datos y se rellenan los campos vacíos
  async function adjuntar(nuevo: File | null) {
    setArchivo(nuevo);
    if (!nuevo) return;
    if (!/\.pdf$/i.test(nuevo.name)) return toast.info("De las fotos no se pueden leer los datos: rellénalos a mano.");
    setLeyendo(true);
    try {
      const datos = new FormData();
      datos.append("archivo", nuevo);
      const r = await fetch("/api/gastos/leer", { method: "POST", body: datos });
      const j = (await r.json()) as { sinTexto?: boolean; datos?: DatosLeidos; proveedor?: Proveedor | null };
      if (!r.ok || j.sinTexto || !j.datos) return toast.info("Este PDF es un escaneo: no se pueden leer los datos, rellénalos a mano.");
      const d = j.datos;
      const p = j.proveedor;
      setC((x) => ({
        ...x,
        proveedor: x.proveedor || p?.nombre || "",
        nif: x.nif || d.nif || p?.nif || "",
        iban: x.iban || d.iban || p?.iban || "",
        numero: x.numero || d.numero || "",
        concepto: x.concepto || conceptoAuto(x.numero || d.numero || ""),
        fecha: d.fecha ?? x.fecha,
        categoria: x.categoria || p?.categoria || "",
        base: x.base || (d.base !== null ? String(d.base).replace(".", ",") : d.total !== null && d.ivaPct !== null
          ? String(Math.round(d.total / (1 + d.ivaPct / 100 - (d.irpfPct ?? 0) / 100) * 100) / 100).replace(".", ",") : ""),
        iva: d.ivaPct !== null ? String(d.ivaPct) : x.iva,
        irpf: d.irpfPct !== null ? String(d.irpfPct) : x.irpf,
      }));
      const leidos = [d.nif && "NIF", d.iban && "IBAN", d.numero && "nº", d.fecha && "fecha", (d.base ?? d.total) !== null && "importes"].filter(Boolean);
      toast.success(`${p ? `Proveedor reconocido: ${p.nombre}. ` : ""}He leído ${leidos.length ? leidos.join(", ") : "poco"}: revísalo antes de guardar.`, { duration: 8000 });
    } catch {
      toast.info("No he podido leer el PDF: rellena los datos a mano.");
    } finally {
      setLeyendo(false);
    }
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!c.proveedor.trim()) return toast.error("Escribe el proveedor");
    if (base === null || base < 0) return toast.error("Escribe la base (sin IVA)");
    // Un proveedor de eventos (montadores, furgonetas…) apuntado como gasto general: preguntar
    const habitual = listas.categoriasGasto.find((x) => x.codigo === existente?.categoria);
    if (!c.evento && habitual?.tipo === "variable"
      && !window.confirm(`${existente!.nombre} suele ser un gasto de evento (${habitual.nombre}). ¿Guardarlo como gasto general, sin evento?`)) return;
    if (archivo && archivo.size > 4 * 1024 * 1024) return toast.error("El archivo pesa más de 4 MB");
    setGuardando(true);
    try {
      const sb = crearClienteNavegador();
      // Archivo a 01. PENDIENTE SARA/02. RECIBIDAS
      let subido: { id: string; url: string; nombre: string } | null = null;
      if (archivo) {
        const datos = new FormData();
        datos.append("archivo", archivo);
        const r = await fetch("/api/gastos/archivo", { method: "POST", body: datos });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "No se pudo subir el archivo");
        subido = j;
      }
      // Proveedor: el que ya existe (actualizando NIF/IBAN si se han escrito) o uno nuevo
      const datosProveedor = { nif: c.nif.replace(/\s/g, "").toUpperCase() || null, iban: c.iban.trim() ? formatoIban(c.iban) : null };
      let proveedorId = existente?.id;
      if (existente) {
        const cambios = Object.fromEntries(Object.entries(datosProveedor).filter(([k, v]) => v && v !== existente[k as keyof Proveedor]));
        if (!existente.categoria && c.categoria) Object.assign(cambios, { categoria: c.categoria });
        if (Object.keys(cambios).length) {
          const r = await sb.from("proveedores").update(cambios).eq("id", existente.id);
          if (r.error) throw new Error(r.error.message);
        }
      } else {
        const r = await sb.from("proveedores").insert({ nombre: c.proveedor.trim(), ...datosProveedor, categoria: c.categoria || null }).select("id").single();
        if (r.error) throw new Error(r.error.message);
        proveedorId = r.data.id;
      }
      const fila = {
        proveedor_id: proveedorId,
        numero: c.numero.trim() || null,
        fecha: c.fecha,
        vencimiento: c.vencimiento || null,
        concepto: c.concepto.trim() || null,
        evento_id: c.evento || null,
        categoria: c.categoria || null,
        base,
        iva_pct: Number(c.iva) || 0,
        irpf_pct: Number(c.irpf) || 0,
        iban: datosProveedor.iban,
        comentarios: c.comentarios.trim() || null,
        ...(subido ? { archivo_item_id: subido.id, archivo_url: subido.url, archivo_nombre: subido.nombre } : {}),
      };
      const r = gasto
        ? await sb.from("facturas_recibidas").update(fila).eq("id", gasto.id)
        : await sb.from("facturas_recibidas").insert(fila);
      if (r.error) throw new Error(r.error.message);
      toast.success(subido ? `Guardada ✓ · ${subido.nombre} en PENDIENTE SARA/02. RECIBIDAS` : "Guardada ✓");
      cerrar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(a) => !a && cerrar()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{gasto ? "Editar factura recibida" : "Factura recibida"}</DialogTitle>
          <DialogDescription>Adjunta primero el PDF: se leen solos el NIF, el IBAN, el número, la fecha y los importes. Se guarda en 03. FINANCIERO/01. FACTURAS/01. PENDIENTE SARA/02. RECIBIDAS.</DialogDescription>
        </DialogHeader>
        <form id="form-gasto" onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
          <Campo id="g-archivo" etiqueta="Factura (PDF o foto)" className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={leyendo} onClick={() => archivoRef.current?.click()}>
                <Paperclip className="size-4" aria-hidden /> {leyendo ? "Leyendo el PDF…" : archivo ? "Cambiar archivo" : gasto?.archivo_nombre ? "Sustituir archivo" : "Adjuntar archivo"}
              </Button>
              <span className="min-w-0 truncate text-sm text-muted-foreground">{archivo?.name ?? gasto?.archivo_nombre ?? "Si es un PDF, se rellenan solos los datos"}</span>
              <input ref={archivoRef} id="g-archivo" type="file" accept="application/pdf,image/*" className="hidden"
                onChange={(e) => void adjuntar(e.target.files?.[0] ?? null)} />
            </div>
          </Campo>
          <Campo id="g-proveedor" etiqueta="Proveedor" className="sm:col-span-2">
            <Autocompletar id="g-proveedor" required autoFocus valor={c.proveedor} placeholder="Escribe el nombre: David…"
              onTexto={(t) => set("proveedor", t)}
              onElegir={(s) => { const p = proveedores.find((x) => x.id === s.id); if (p) elegirProveedor(p); }}
              sugerencias={proveedores.map((p) => ({ id: p.id, texto: p.nombre, detalle: [p.nif, p.iban].filter(Boolean).join(" · ") || undefined }))} />
            {c.proveedor.trim() && !existente && <span className="text-xs text-muted-foreground">Proveedor nuevo: se guarda en Proveedores para la próxima vez.</span>}
          </Campo>
          <Campo id="g-nif" etiqueta="NIF del proveedor"><Input id="g-nif" value={c.nif} onChange={(e) => set("nif", e.target.value)} /></Campo>
          <Campo id="g-iban" etiqueta="IBAN (para pagarle)"><Input id="g-iban" value={c.iban} onChange={(e) => set("iban", e.target.value)} placeholder="ES00 0000 0000 0000 0000 0000" /></Campo>
          <Campo id="g-numero" etiqueta="Nº de factura"><Input id="g-numero" value={c.numero} onChange={(e) => cambiarNumero(e.target.value)} placeholder="Vacío si es un tique" /></Campo>
          <Campo id="g-fecha" etiqueta="Fecha de la factura"><Input id="g-fecha" type="date" required value={c.fecha} onChange={(e) => set("fecha", e.target.value)} /></Campo>
          <Campo id="g-evento" etiqueta="¿De qué evento es?" className="sm:col-span-2">
            {c.evento ? (
              <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-sm">
                <span className="flex-1">{eventos.find((e) => e.id === c.evento)?.texto ?? "Evento"}</span>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Quitar el evento" onClick={() => setC((x) => ({ ...x, evento: "", categoria: "" }))}>
                  <X className="size-3.5" aria-hidden />
                </Button>
              </div>
            ) : (
              <>
                <Autocompletar id="g-evento" valor={eventoTexto} placeholder="Escribe el cliente o la fecha… (vacío = gasto general)"
                  onTexto={setEventoTexto}
                  onElegir={(s) => { setC((x) => ({ ...x, evento: s.id, categoria: "" })); setEventoTexto(""); }}
                  sugerencias={eventos.map((e) => ({ id: e.id, texto: e.texto }))} />
                {cercanos.length > 0 && (
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    ¿Es de alguno de estos?
                    {cercanos.map((e) => (
                      <button key={e.id} type="button" className="rounded-full border bg-card px-2 py-0.5 text-foreground hover:bg-muted"
                        onClick={() => setC((x) => ({ ...x, evento: e.id, categoria: "" }))}>{e.texto}</button>
                    ))}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">Si no eliges ninguno, es un gasto general (gestoría, web, seguro…).</span>
              </>
            )}
          </Campo>
          <Campo id="g-categoria" etiqueta="Categoría">
            <select id="g-categoria" className={claseSelect} value={c.categoria} onChange={(e) => set("categoria", e.target.value)}>
              <option value="">—</option>
              {categorias.map((x) => <option key={x.codigo} value={x.codigo}>{x.nombre}</option>)}
            </select>
          </Campo>
          <Campo id="g-vencimiento" etiqueta="Vencimiento (opcional)"><Input id="g-vencimiento" type="date" value={c.vencimiento} onChange={(e) => set("vencimiento", e.target.value)} /></Campo>
          <Campo id="g-concepto" etiqueta="Concepto de la transferencia (lo verá el proveedor en su banco)" className="sm:col-span-2">
            <Input id="g-concepto" maxLength={140} value={c.concepto} onChange={(e) => set("concepto", e.target.value)} placeholder="Pago factura 21" />
          </Campo>
          <Campo id="g-base" etiqueta="Base sin IVA (€)"><Input id="g-base" inputMode="decimal" required value={c.base} onChange={(e) => set("base", e.target.value)} /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo id="g-iva" etiqueta="IVA %"><Input id="g-iva" type="number" min={0} max={100} value={c.iva} onChange={(e) => set("iva", e.target.value)} /></Campo>
            <Campo id="g-irpf" etiqueta="IRPF %"><Input id="g-irpf" type="number" min={0} max={100} value={c.irpf} onChange={(e) => set("irpf", e.target.value)} /></Campo>
          </div>
          <div className="rounded-lg border bg-background p-3 text-sm sm:col-span-2">
            Total a pagar: <b>{formatoEuros(total)}</b>
            <span className="text-muted-foreground"> · el IRPF es la retención que llevan algunas facturas de autónomos</span>
          </div>
          <Campo id="g-comentarios" etiqueta="Comentarios" className="sm:col-span-2">
            <Textarea id="g-comentarios" rows={2} value={c.comentarios} onChange={(e) => set("comentarios", e.target.value)} />
          </Campo>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" form="form-gasto" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Una factura recibida en una lista, con sus botones
// Copia al portapapeles (IBAN, importe, concepto) para hacer una transferencia suelta
function Copiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  return (
    <button type="button" className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
      onClick={async () => { await navigator.clipboard.writeText(texto); toast.success(`${etiqueta} copiado ✓`); }}>
      <span><span className="text-xs text-muted-foreground">{etiqueta}</span><br />{texto}</span>
      <span className="text-xs text-muted-foreground">Copiar</span>
    </button>
  );
}

export function LineaGasto({ g, mostrarEvento = true, seleccion }: {
  g: FacturaRecibida; mostrarEvento?: boolean; seleccion?: { marcada: boolean; cambiar: () => void };
}) {
  const { enCurso, unaVez } = useUnaVez();
  const listas = useListas();
  const hoy = hoyMadrid();
  const [dialogo, setDialogo] = useState<"editar" | "pagar" | null>(null);
  const [fechaPago, setFechaPago] = useState(hoy);
  const sb = crearClienteNavegador();

  async function pagar() {
    const { error } = await sb.from("facturas_recibidas").update({ estado: "pagada", fecha_pago: fechaPago }).eq("id", g.id);
    if (error) return toast.error(error.message);
    toast.success("Marcada como pagada ✓");
    setDialogo(null);
  }

  async function deshacerPago() {
    if (!window.confirm("¿Esta factura todavía no está pagada?")) return;
    const { error } = await sb.from("facturas_recibidas").update({ estado: "pendiente", fecha_pago: null }).eq("id", g.id);
    if (error) toast.error(error.message);
  }

  async function quitar() {
    if (!window.confirm("¿Mover esta factura recibida a la papelera? El archivo se queda en SharePoint.")) return;
    try {
      await moverAPapelera("facturas_recibidas", g.id);
      toast.success("Movida a la papelera");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo quitar");
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t py-3 text-sm first:border-t-0">
      {seleccion && (
        <input type="checkbox" className="size-4" aria-label={`Pagar ${g.proveedor?.nombre ?? "factura"}`} checked={seleccion.marcada} onChange={seleccion.cambiar} />
      )}
      <div className="min-w-0 flex-[1_1_240px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{g.proveedor?.nombre ?? "Sin proveedor"}</span>
          {g.numero && <span className="text-muted-foreground">nº {g.numero}</span>}
          <EtiquetaGasto g={g} hoy={hoy} />
        </div>
        <div className="truncate text-[13px] text-muted-foreground">
          {[
            formatoFecha(g.fecha),
            nombreDe(listas.categoriasGasto, g.categoria),
            g.concepto,
            g.vencimiento && g.estado !== "pagada" && `vence ${formatoFecha(g.vencimiento)}`,
            g.fecha_pago && `pagada ${formatoFecha(g.fecha_pago)}`,
          ].filter((x) => x && x !== "—").join(" · ")}
          {mostrarEvento && (g.evento
            ? <> · <Link href={`/eventos/${g.evento.id}`}>{g.evento.cliente?.nombre ?? "Evento"}</Link></>
            : " · Gasto general")}
        </div>
      </div>
      <div className="text-right">
        <div className="font-medium">{formatoEuros(g.total)}</div>
        <div className="text-xs text-muted-foreground">base {formatoEuros(g.base)}</div>
      </div>
      <span className="flex flex-wrap items-center gap-1.5">
        {g.archivo_item_id && (
          <Button size="icon-sm" variant="ghost" aria-label="Ver la factura" title={g.archivo_nombre ?? "Ver la factura"}
            render={<a href={`/api/gastos/archivo?id=${g.id}`} target="_blank" rel="noreferrer" />}>
            <Paperclip className="size-3.5" aria-hidden />
          </Button>
        )}
        {g.estado === "pendiente"
          ? <Button size="sm" variant="outline" onClick={() => setDialogo("pagar")}>Marcar pagada</Button>
          : <Button size="sm" variant="ghost" onClick={deshacerPago}>Deshacer pago</Button>}
        <Button size="sm" variant="ghost" onClick={() => setDialogo("editar")}>Editar</Button>
        <Button size="sm" variant="ghost" onClick={quitar}>Quitar</Button>
      </span>

      {dialogo === "editar" && <DialogoGasto gasto={g} cerrar={() => setDialogo(null)} />}
      <Dialog open={dialogo === "pagar"} onOpenChange={(a) => !a && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagada</DialogTitle>
            <DialogDescription>Para una transferencia suelta, copia los datos en el Santander. Para varias a la vez, usa “Pagar con el Santander”.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {g.proveedor?.nombre && <Copiar etiqueta="Beneficiario" texto={g.proveedor.nombre} />}
            {g.iban && <Copiar etiqueta="IBAN" texto={g.iban} />}
            <Copiar etiqueta="Importe" texto={g.total.toFixed(2).replace(".", ",")} />
            <Copiar etiqueta="Concepto" texto={g.concepto ?? (g.numero ? `Pago factura ${g.numero}` : "Pago factura")} />
          </div>
          <Campo id={`gp-${g.id}`} etiqueta="Fecha del pago">
            <Input id={`gp-${g.id}`} type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
          </Campo>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>Cancelar</Button>
            <Button disabled={!fechaPago || enCurso} onClick={unaVez(pagar)}>Marcar pagada</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
