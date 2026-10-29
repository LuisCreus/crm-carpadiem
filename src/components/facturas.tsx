"use client";

// Piezas de facturación que comparten la ficha del evento y la pantalla Facturas.

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Campo, claseSelect } from "@/components/campo";
import { Etiqueta } from "@/components/etiqueta-estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { moverAPapelera } from "@/lib/datos/papelera";
import type { DatosFacturacion, Factura, TipoFactura } from "@/lib/datos/tipos";
import { ESTADOS_FACTURA, TIPOS_FACTURA, totalFactura } from "@/lib/facturacion";
import { formatoEuros, formatoFecha, hoyMadrid, leerEuros } from "@/lib/formato";

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
  const [dialogo, setDialogo] = useState<"emitir" | "pagar" | null>(null);
  const [fechaPago, setFechaPago] = useState(hoyMadrid());
  const [ocupado, setOcupado] = useState(false);
  const sb = crearClienteNavegador();
  const { iva, total } = totalFactura(f);

  async function emitir() {
    setOcupado(true);
    const { data, error } = await sb.rpc("emitir_factura", { p_id: f.id });
    setOcupado(false);
    if (error) return toast.error(error.message);
    toast.success(`Factura ${data as string} emitida ✓`, { duration: 10000 });
    setDialogo(null);
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
          <Button size="sm" onClick={() => setDialogo("emitir")}>Emitir</Button>
          {editar && <Button size="sm" variant="ghost" onClick={editar}>Editar</Button>}
          <Button size="sm" variant="ghost" onClick={quitar}>Quitar</Button>
        </>
      )}
      {f.estado === "emitida" && <Button size="sm" variant="outline" onClick={() => setDialogo("pagar")}>Marcar pagada</Button>}
      {f.estado === "pagada" && <Button size="sm" variant="ghost" onClick={deshacerPago}>Deshacer pago</Button>}

      <Dialog open={dialogo === "emitir"} onOpenChange={(a) => !a && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emitir factura</DialogTitle>
            <DialogDescription>Recibe el siguiente número (CD {new Date().getFullYear()}/…) y ya no se puede borrar ni cambiar de importe.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <TextoDatosFacturacion d={datos} />
            <div className="rounded-lg border bg-background p-3">
              <div>{f.concepto ?? TIPOS_FACTURA[f.tipo]}</div>
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 text-muted-foreground">
                <span>Base</span><span className="text-right">{formatoEuros(f.importe)}</span>
                <span>IVA {f.iva_pct} %</span><span className="text-right">{formatoEuros(iva)}</span>
                {f.suplidos > 0 && <><span>Suplidos</span><span className="text-right">{formatoEuros(f.suplidos)}</span></>}
                <span className="font-semibold text-foreground">Total</span><span className="text-right font-semibold text-foreground">{formatoEuros(total)}</span>
              </div>
            </div>
            <p className="text-[13px] text-muted-foreground">Hasta que el CRM genere el PDF (Fase 12), haz la factura en el Excel con el número que te dé el CRM.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>Cancelar</Button>
            <Button disabled={ocupado || !datos.fact_nombre} onClick={emitir}>{ocupado ? "Emitiendo…" : "Emitir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          {[extra, f.concepto, f.fecha_emision && `emitida ${formatoFecha(f.fecha_emision)}`, f.fecha_pago && `pagada ${formatoFecha(f.fecha_pago)}`].filter(Boolean).map((t, i) => <span key={i}>{i > 0 && " · "}{t}</span>)}
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
