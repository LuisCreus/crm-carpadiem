"use client";

// Piezas de facturación que comparten la ficha del evento y la pantalla Facturas.

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Download, Mail, Share2 } from "lucide-react";
import { Campo, claseSelect } from "@/components/campo";
import { Etiqueta } from "@/components/etiqueta-estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { moverAPapelera } from "@/lib/datos/papelera";
import type { DatosFacturacion, Factura, TipoFactura } from "@/lib/datos/tipos";
import { ESTADOS_FACTURA, TIPOS_FACTURA, conceptoAlEmitir, textoCorreoFactura, totalFactura } from "@/lib/facturacion";
import { formatoEuros, formatoFecha, hoyMadrid, leerEuros } from "@/lib/formato";
import { generarPdfFactura } from "@/lib/facturas-pdf";
import { estadoCorreo, prepararCorreoFactura } from "@/lib/correo-facturas";

export function EtiquetaFactura({ f }: { f: Pick<Factura, "estado"> }) {
  const e = ESTADOS_FACTURA[f.estado];
  return <Etiqueta className={e.clase}>{e.texto}</Etiqueta>;
}

const CAMPOS_FISCALES: [keyof DatosFacturacion, string, string?][] = [
  ["fact_nombre", "Nombre o razón social"],
  ["fact_nif", "DNI / NIF"],
  ["fact_domicilio", "Domicilio fiscal"],
  ["fact_cp_ciudad", "CP y ciudad"],
  ["fact_email", "Email para enviar la factura", "email"],
];

export const datosVacios = (): DatosFacturacion =>
  ({ fact_nombre: null, fact_nif: null, fact_domicilio: null, fact_cp_ciudad: null, fact_email: null });

// Datos de facturación de un evento: los suyos si se factura a otro; si no, los del cliente
export function datosEfectivos(evento: DatosFacturacion, cliente: DatosFacturacion | null): DatosFacturacion & { deOtro: boolean } {
  if (evento.fact_nombre) return { ...evento, deOtro: true };
  return { ...(cliente ?? datosVacios()), deOtro: false };
}

export function TextoDatosFacturacion({ d }: { d: DatosFacturacion }) {
  if (!d.fact_nombre) return <p className="text-sm text-muted-foreground">Faltan los datos de facturación (nombre y NIF).</p>;
  return (
    <div className="text-sm">
      <div className="font-medium">{d.fact_nombre}{d.fact_nif && <span className="font-normal text-muted-foreground"> · {d.fact_nif}</span>}</div>
      {(d.fact_domicilio || d.fact_cp_ciudad) && <div className="text-muted-foreground">{[d.fact_domicilio, d.fact_cp_ciudad].filter(Boolean).join(" · ")}</div>}
      {d.fact_email && <div className="text-muted-foreground">{d.fact_email}</div>}
    </div>
  );
}

// Editar datos de facturación. Con "soloEvento" se guardan en el evento (se factura a otra persona o empresa)
export function DialogoDatosFacturacion({ cerrar, clienteId, eventoId, inicial, inicialSoloEvento }: {
  cerrar: () => void; clienteId: string; eventoId?: string; inicial: DatosFacturacion; inicialSoloEvento?: boolean;
}) {
  const [d, setD] = useState<Record<keyof DatosFacturacion, string>>({
    fact_nombre: inicial.fact_nombre ?? "", fact_nif: inicial.fact_nif ?? "", fact_domicilio: inicial.fact_domicilio ?? "",
    fact_cp_ciudad: inicial.fact_cp_ciudad ?? "", fact_email: inicial.fact_email ?? "",
  });
  const [soloEvento, setSoloEvento] = useState(Boolean(inicialSoloEvento));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const datos = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.trim() || null])) as DatosFacturacion;
    const sb = crearClienteNavegador();
    const r = soloEvento && eventoId
      ? await sb.from("eventos").update(datos).eq("id", eventoId)
      : await sb.from("clientes").update(datos).eq("id", clienteId);
    if (r.error) return toast.error(r.error.message);
    // Si vuelve a facturarse al cliente, el evento deja de tener datos propios
    if (!soloEvento && eventoId) {
      const r2 = await sb.from("eventos").update(datosVacios()).eq("id", eventoId);
      if (r2.error) return toast.error(r2.error.message);
    }
    toast.success("Datos de facturación guardados ✓");
    cerrar();
  }

  return (
    <Dialog open onOpenChange={(a) => !a && cerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Datos de facturación</DialogTitle>
          <DialogDescription>Salen en la factura. Se copian en cada factura al emitirla.</DialogDescription>
        </DialogHeader>
        <form id="form-fiscal" onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
          {CAMPOS_FISCALES.map(([k, etiqueta, tipo]) => (
            <Campo key={k} id={`df-${k}`} etiqueta={etiqueta} className={k === "fact_nombre" || k === "fact_domicilio" ? "sm:col-span-2" : undefined}>
              <Input id={`df-${k}`} type={tipo ?? "text"} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
            </Campo>
          ))}
          {eventoId && (
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="mt-1" checked={soloEvento} onChange={(e) => setSoloEvento(e.target.checked)} />
              <span>Solo para este evento <span className="text-muted-foreground">(se factura a otra persona o empresa, por ejemplo la wedding planner)</span></span>
            </label>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" form="form-fiscal">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Añadir o editar una factura (solo las que están por emitir)
export function DialogoFactura({ cerrar, factura, eventoId, clienteId, inicial }: {
  cerrar: () => void; factura?: Factura; eventoId: string; clienteId: string;
  inicial?: { tipo: TipoFactura; concepto: string; importe: number | null };
}) {
  const [tipo, setTipo] = useState<TipoFactura>(factura?.tipo ?? inicial?.tipo ?? "otra");
  const [concepto, setConcepto] = useState(factura?.concepto ?? inicial?.concepto ?? "");
  const [descripcion, setDescripcion] = useState(factura?.descripcion ?? "");
  const [importe, setImporte] = useState(
    factura ? String(factura.importe).replace(".", ",") : inicial?.importe !== null && inicial?.importe !== undefined ? String(inicial.importe).replace(".", ",") : "");
  const [iva, setIva] = useState(String(factura?.iva_pct ?? 21));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const valor = leerEuros(importe);
    if (valor === null || valor <= 0) return toast.error("Escribe el importe sin IVA");
    const datos = { tipo, concepto: concepto.trim() || null, descripcion: descripcion.trim() || null, importe: valor, iva_pct: Number(iva) };
    const sb = crearClienteNavegador();
    const r = factura
      ? await sb.from("facturas").update(datos).eq("id", factura.id)
      : await sb.from("facturas").insert({ ...datos, evento_id: eventoId, cliente_id: clienteId });
    if (r.error) return toast.error(r.error.message);
    toast.success(factura ? "Guardado ✓" : "Factura añadida ✓");
    cerrar();
  }

  return (
    <Dialog open onOpenChange={(a) => !a && cerrar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{factura ? "Editar factura por emitir" : "Añadir factura"}</DialogTitle>
          <DialogDescription>Importe sin IVA. Lo que quede del total del evento se ajusta solo en “Resto”.</DialogDescription>
        </DialogHeader>
        <form id="form-factura" onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
          <Campo id="fa-tipo" etiqueta="Tipo">
            <select id="fa-tipo" className={claseSelect} value={tipo} onChange={(e) => setTipo(e.target.value as TipoFactura)}>
              {Object.entries(TIPOS_FACTURA).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </Campo>
          <Campo id="fa-importe" etiqueta="Importe sin IVA (€)">
            <Input id="fa-importe" inputMode="decimal" required autoFocus value={importe} onChange={(e) => setImporte(e.target.value)} />
          </Campo>
          <Campo id="fa-concepto" etiqueta="Concepto (sale en la factura)" className="sm:col-span-2">
            <Input id="fa-concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </Campo>
          <Campo id="fa-desc" etiqueta="Descripción (material)" className="sm:col-span-2">
            <Textarea id="fa-desc" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </Campo>
          <Campo id="fa-iva" etiqueta="IVA %">
            <Input id="fa-iva" type="number" min={0} max={100} value={iva} onChange={(e) => setIva(e.target.value)} />
          </Campo>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" form="form-factura">{factura ? "Guardar" : "Añadir"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Botones de una factura según su estado: Emitir · Marcar pagada · Deshacer pago · Editar · Quitar
export function AccionesFactura({ f, datos, editar }: { f: Factura; datos: DatosFacturacion; editar?: () => void }) {
  const [dialogo, setDialogo] = useState<"emitir" | "pagar" | "datos" | "correo" | null>(null);
  const [fechaPago, setFechaPago] = useState(hoyMadrid());
  const faltanDatos = !datos.fact_nombre || !datos.fact_nif;
  const [ocupado, setOcupado] = useState(false);
  const [concepto, setConcepto] = useState("");
  // Vista previa: el PDF y con qué concepto y datos se hizo (si cambian, hay que volver a verla)
  const [vista, setVista] = useState<{ url: string; clave: string } | null>(null);
  const [generandoVista, setGenerandoVista] = useState(false);
  const claveVista = [concepto.trim(), datos.fact_nombre, datos.fact_nif, datos.fact_domicilio, datos.fact_cp_ciudad].join("|");
  const vistaAlDia = vista?.clave === claveVista;

  function abrirEmitir() {
    setConcepto(conceptoAlEmitir(f, hoyMadrid()));
    if (vista) URL.revokeObjectURL(vista.url);
    setVista(null);
    setDialogo("emitir");
  }

  async function verPdf() {
    if (!concepto.trim()) return toast.error("Escribe el concepto");
    setGenerandoVista(true);
    try {
      const resp = await fetch("/api/factura/vista-previa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facturaId: f.id, concepto }),
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.error ?? "No se pudo generar la vista previa");
      if (vista) URL.revokeObjectURL(vista.url);
      setVista({ url: URL.createObjectURL(await resp.blob()), clave: claveVista });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar la vista previa");
    } finally {
      setGenerandoVista(false);
    }
  }
  const sb = crearClienteNavegador();
  const { iva, total } = totalFactura(f);

  async function emitir() {
    setOcupado(true);
    // El concepto que se ha revisado en la vista previa es el que va en la factura
    if (concepto.trim() !== (f.concepto ?? "")) {
      const r = await sb.from("facturas").update({ concepto: concepto.trim() }).eq("id", f.id);
      if (r.error) {
        setOcupado(false);
        return toast.error(r.error.message);
      }
    }
    const { data, error } = await sb.rpc("emitir_factura", { p_id: f.id });
    if (error) {
      setOcupado(false);
      return toast.error(error.message);
    }
    setDialogo(null);
    const id = toast.loading(`Factura ${data as string} emitida ✓ · generando el PDF…`);
    const r = await generarPdfFactura(f.id);
    setOcupado(false);
    if (r.ok) toast.success(`${r.nombre} guardada en PENDIENTE SARA ✓`, { id, duration: 8000 });
    else toast.error(`Factura ${data as string} emitida, pero el PDF no: ${r.error}. Pulsa “Generar PDF”.`, { id, duration: 15000 });
  }

  async function pdf() {
    setOcupado(true);
    const id = toast.loading("Generando el PDF…");
    const r = await generarPdfFactura(f.id);
    setOcupado(false);
    if (r.ok) toast.success(`${r.nombre} guardada ✓`, { id });
    else toast.error(r.error, { id, duration: 15000 });
  }

  async function compartir() {
    try {
      const resp = await fetch(`/api/factura/${f.id}`);
      if (!resp.ok) throw new Error("No se pudo descargar el PDF");
      const nombre = f.pdf_nombre ?? `FACTURA ${f.codigo}.pdf`;
      const archivo = new File([await resp.blob()], nombre, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [archivo] })) await navigator.share({ files: [archivo], title: nombre });
      else window.open(`/api/factura/${f.id}?ver=1`, "_blank");
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") toast.error(e.message);
    }
  }

  async function pagar() {
    setOcupado(true);
    const { error } = await sb.rpc("marcar_factura_pagada", { p_id: f.id, p_fecha: fechaPago });
    setOcupado(false);
    if (error) return toast.error(error.message);
    toast.success(`${f.codigo} pagada ✓ · cobro apuntado`);
    setDialogo(null);
  }

  async function deshacerPago() {
    if (!window.confirm(`¿${f.codigo} no está pagada? Se quita también su cobro.`)) return;
    const { error } = await sb.rpc("desmarcar_factura_pagada", { p_id: f.id });
    if (error) toast.error(error.message);
    else toast.success("Pago deshecho");
  }

  async function quitar() {
    // El Resto es "lo que falta por facturar": quitarlo significa que al cliente se le factura menos.
    // Se ajusta el total del presupuesto a lo ya facturado y así deja de quedar pendiente.
    if (f.tipo === "resto" && f.automatica && f.evento_id) {
      const [{ data: ev }, { data: emitidas }] = await Promise.all([
        sb.from("eventos").select("presupuesto_id, importe").eq("id", f.evento_id).maybeSingle(),
        sb.from("facturas").select("importe").eq("evento_id", f.evento_id).neq("estado", "prevista").neq("tipo", "mensualidad").is("deleted_at", null),
      ]);
      const facturado = (emitidas ?? []).reduce((s, x) => s + Number(x.importe), 0);
      if (!ev?.presupuesto_id || facturado <= 0) {
        return toast.error("Este evento no tiene nada facturado todavía: cambia el importe del presupuesto o márcalo como caído.", { duration: 10000 });
      }
      if (!window.confirm(`¿No se va a facturar el resto (${formatoEuros(f.importe)})?\n\nEl total del presupuesto pasa de ${formatoEuros(Number(ev.importe))} a ${formatoEuros(facturado)}, que es lo ya facturado, y deja de quedar pendiente.`)) return;
      const { error } = await sb.from("presupuestos").update({ importe: facturado }).eq("id", ev.presupuesto_id);
      if (error) return toast.error(error.message);
      return toast.success(`Resto quitado ✓ · el total queda en ${formatoEuros(facturado)}`);
    }
    if (!window.confirm("¿Quitar esta factura por emitir? Lo que falte se ajusta en “Resto”.")) return;
    try {
      await moverAPapelera("facturas", f.id);
      toast.success("Quitada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo quitar");
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {f.estado === "prevista" && (
        <>
          <Button size="sm" onClick={abrirEmitir}>Emitir</Button>
          {editar && <Button size="sm" variant="ghost" onClick={editar}>Editar</Button>}
          <Button size="sm" variant="ghost" onClick={quitar}>Quitar</Button>
        </>
      )}
      {f.estado !== "prevista" && (f.pdf_item_id ? (
        <>
          <Button size="icon-sm" variant="ghost" aria-label={`Descargar PDF de ${f.codigo}`} render={<a href={`/api/factura/${f.id}`} />}>
            <Download className="size-3.5" aria-hidden />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={`Compartir PDF de ${f.codigo}`} onClick={compartir}>
            <Share2 className="size-3.5" aria-hidden />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialogo("correo")}>
            <Mail className="size-3.5" aria-hidden /> Correo
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" disabled={ocupado} onClick={pdf}>Generar PDF</Button>
      ))}
      {f.estado === "emitida" && <Button size="sm" variant="outline" onClick={() => setDialogo("pagar")}>Marcar pagada</Button>}
      {f.estado === "pagada" && <Button size="sm" variant="ghost" onClick={deshacerPago}>Deshacer pago</Button>}

      <Dialog open={dialogo === "emitir"} onOpenChange={(a) => !a && setDialogo(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Emitir factura</DialogTitle>
            <DialogDescription>Revisa el PDF antes de emitir. Al emitir recibe el siguiente número y ya no se puede borrar ni cambiar de importe.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
              <div className="min-w-0 flex-1"><TextoDatosFacturacion d={datos} /></div>
              {f.cliente_id && (
                <Button size="sm" variant={faltanDatos ? "default" : "ghost"} onClick={() => setDialogo("datos")}>
                  {faltanDatos ? "Rellenar" : "Cambiar"}
                </Button>
              )}
            </div>
            <Campo id={`concepto-${f.id}`} etiqueta="Concepto (sale en la factura)">
              <Textarea id={`concepto-${f.id}`} rows={2} value={concepto} onChange={(e) => setConcepto(e.target.value)} />
            </Campo>
            <div className="rounded-lg border bg-background p-3">
              <div className="text-muted-foreground">{TIPOS_FACTURA[f.tipo]}</div>
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 text-muted-foreground">
                <span>Base</span><span className="text-right">{formatoEuros(f.importe)}</span>
                <span>IVA {f.iva_pct} %</span><span className="text-right">{formatoEuros(iva)}</span>
                {f.suplidos > 0 && <><span>Suplidos</span><span className="text-right">{formatoEuros(f.suplidos)}</span></>}
                <span className="font-semibold text-foreground">Total</span><span className="text-right font-semibold text-foreground">{formatoEuros(total)}</span>
              </div>
            </div>
            {vista && (
              <div className="grid gap-1.5">
                <iframe title="Vista previa de la factura" src={vista.url} className="h-[60dvh] w-full rounded-lg border bg-white" />
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                  {vistaAlDia ? "Número provisional: el definitivo se pone al emitir." : "Has cambiado algo: vuelve a ver el PDF antes de emitir."}
                  <a href={vista.url} target="_blank" rel="noreferrer" className="ml-auto">Abrir en otra pestaña</a>
                </div>
              </div>
            )}
            <p className="text-[13px] text-muted-foreground">Al emitir, el PDF se guarda en 03. FINANCIERO/01. FACTURAS/01. PENDIENTE SARA/01. EMITIDAS.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>Cancelar</Button>
            <Button variant={vistaAlDia ? "outline" : "default"} disabled={generandoVista || faltanDatos} onClick={verPdf}>
              {generandoVista ? "Preparando el PDF…" : vista ? "Volver a ver el PDF" : "Ver PDF"}
            </Button>
            <Button disabled={ocupado || faltanDatos || !vistaAlDia} onClick={emitir}>{ocupado ? "Emitiendo…" : "Emitir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dialogo === "correo" && <DialogoCorreo f={f} email={f.fact_email ?? datos.fact_email} cerrar={() => setDialogo(null)} />}

      {dialogo === "datos" && f.cliente_id && (
        <DialogoDatosFacturacion cerrar={() => setDialogo("emitir")} clienteId={f.cliente_id} eventoId={f.evento_id ?? undefined}
          inicial={datos} inicialSoloEvento={Boolean((datos as { deOtro?: boolean }).deOtro)} />
      )}

      <Dialog open={dialogo === "pagar"} onOpenChange={(a) => !a && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{f.codigo} pagada</DialogTitle>
            <DialogDescription>Se apunta como cobro del presupuesto ({formatoEuros(f.importe)} sin IVA).</DialogDescription>
          </DialogHeader>
          <Campo id="fp-fecha" etiqueta="Fecha del pago">
            <Input id="fp-fecha" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
          </Campo>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>Cancelar</Button>
            <Button disabled={ocupado || !fechaPago} onClick={pagar}>Marcar pagada</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}

// Correo: prepara un borrador en Outlook con el PDF adjunto; se revisa y se envía desde Outlook
function DialogoCorreo({ f, email, cerrar }: { f: Factura; email: string | null; cerrar: () => void }) {
  const inicial = textoCorreoFactura(f, null);
  const [para, setPara] = useState(f.correo_para ?? email ?? "");
  const [asunto, setAsunto] = useState(inicial.asunto);
  const [texto, setTexto] = useState(inicial.texto);
  const [ocupado, setOcupado] = useState(false);
  const [estado, setEstado] = useState<{ configurado: boolean; buzon: string | null } | null>(null);
  useEffect(() => {
    estadoCorreo().then(setEstado).catch(() => setEstado({ configurado: false, buzon: null }));
  }, []);

  async function preparar() {
    setOcupado(true);
    // La pestaña se abre ya (si se abre después de esperar, el navegador la bloquea)
    const ventana = window.open("", "_blank");
    const r = await prepararCorreoFactura(f.id, { para, asunto, texto });
    setOcupado(false);
    if (!r.ok) {
      ventana?.close();
      return toast.error(r.error, { duration: 12000 });
    }
    if (ventana) ventana.location.href = r.webLink;
    else window.location.href = r.webLink;
    toast.success("Borrador preparado en Outlook ✓ · revísalo y pulsa Enviar", { duration: 10000 });
    cerrar();
  }

  // Sin correo configurado: se abre el correo con el texto y se adjunta el PDF a mano
  const mailto = `mailto:${encodeURIComponent(para)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`;

  return (
    <Dialog open onOpenChange={(a) => !a && cerrar()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Enviar {f.codigo} por correo</DialogTitle>
          <DialogDescription>
            {estado?.configurado
              ? `Se prepara un borrador en Outlook (${estado.buzon}) con el PDF adjunto. Lo revisas y lo envías tú.`
              : "Se abrirá tu correo con el texto; adjunta el PDF que se descarga."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Campo id={`co-para-${f.id}`} etiqueta="Para">
            <Input id={`co-para-${f.id}`} type="email" multiple value={para} onChange={(e) => setPara(e.target.value)} placeholder="cliente@correo.com" />
          </Campo>
          <Campo id={`co-asunto-${f.id}`} etiqueta="Asunto">
            <Input id={`co-asunto-${f.id}`} value={asunto} onChange={(e) => setAsunto(e.target.value)} />
          </Campo>
          <Campo id={`co-texto-${f.id}`} etiqueta="Mensaje">
            <Textarea id={`co-texto-${f.id}`} rows={10} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
          <p className="text-[13px] text-muted-foreground">Adjunto: {f.pdf_nombre ?? `FACTURA ${f.codigo}.pdf`}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          {estado && !estado.configurado ? (
            <>
              <Button variant="outline" render={<a href={`/api/factura/${f.id}`} />}>Descargar PDF</Button>
              <Button render={<a href={mailto} />}>Abrir correo</Button>
            </>
          ) : (
            <Button disabled={ocupado || !estado || !para.trim()} onClick={preparar}>{ocupado ? "Preparando…" : "Preparar en Outlook"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Una línea de factura (ficha del evento y pantalla Facturas)
export function LineaFactura({ f, datos, editar, extra }: { f: Factura; datos: DatosFacturacion; editar?: () => void; extra?: React.ReactNode }) {
  const { total } = totalFactura(f);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t py-3 text-sm first:border-t-0">
      <div className="min-w-0 flex-[1_1_220px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{f.codigo ?? TIPOS_FACTURA[f.tipo]}</span>
          {f.codigo && <span className="text-muted-foreground">{TIPOS_FACTURA[f.tipo]}</span>}
          <EtiquetaFactura f={f} />
        </div>
        <div className="truncate text-[13px] text-muted-foreground">
          {[extra, f.concepto, f.fecha_emision && `emitida ${formatoFecha(f.fecha_emision)}`, f.correo_preparado_at && `correo ${formatoFecha(f.correo_preparado_at)}`, f.fecha_pago && `pagada ${formatoFecha(f.fecha_pago)}`].filter(Boolean).map((t, i) => <span key={i}>{i > 0 && " · "}{t}</span>)}
        </div>
      </div>
      <div className="text-right">
        <div className="font-medium">{formatoEuros(f.importe)}</div>
        <div className="text-xs text-muted-foreground">{formatoEuros(total)} con IVA</div>
      </div>
      <AccionesFactura f={f} datos={f.fact_nombre ? f : datos} editar={editar} />
    </li>
  );
}
