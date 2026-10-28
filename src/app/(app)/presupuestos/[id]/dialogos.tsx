"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Campo, claseSelect } from "@/components/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useListas } from "@/hooks/use-listas";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { CONCEPTOS_COBRO, type Presupuesto } from "@/lib/datos/tipos";
import { formatoEuros } from "@/lib/formato";
import type { PrecisionFecha } from "@/lib/negocio";
import { cn } from "@/lib/utils";

type Abierto = { abierto: boolean; cerrar: () => void };

export function DialogoAceptar({ abierto, cerrar, presupuesto }: Abierto & { presupuesto: Presupuesto }) {
  const [modalidad, setModalidad] = useState<"confirmado" | "seguro">("confirmado");
  const [guardando, setGuardando] = useState(false);

  async function aceptar() {
    setGuardando(true);
    const { error } = await crearClienteNavegador().rpc("aceptar_presupuesto", { p_id: presupuesto.id, p_modalidad: modalidad });
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success("Aceptado ✓ · el evento ya está en la Planificación");
    cerrar();
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && cerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aceptar {presupuesto.codigo}</DialogTitle>
          <DialogDescription>
            Se crea el evento y, si hay otras opciones de esta oportunidad sin aceptar, pasan a “Descartada”.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {([
            ["confirmado", "Confirmado", "El evento va sí o sí."],
            ["seguro", "Seguro de lluvia", "El cliente paga un % y reservamos el material; decide hasta 10 días antes."],
          ] as const).map(([valor, titulo, texto]) => (
            <button key={valor} type="button" aria-pressed={modalidad === valor} onClick={() => setModalidad(valor)}
              className={cn("rounded-lg border p-3 text-left", modalidad === valor && "border-foreground ring-1 ring-foreground")}>
              <div className="text-sm font-medium">{titulo}</div>
              <div className="text-[13px] text-muted-foreground">{texto}</div>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button onClick={aceptar} disabled={guardando}>{guardando ? "Aceptando…" : "Aceptar presupuesto"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DialogoRechazar({ abierto, cerrar, presupuesto }: Abierto & { presupuesto: Presupuesto }) {
  const [motivo, setMotivo] = useState("");

  async function rechazar() {
    const { error } = await crearClienteNavegador().from("presupuestos")
      .update({ estado: "rechazado", motivo_rechazo: motivo.trim() || null }).eq("id", presupuesto.id);
    if (error) return toast.error(error.message);
    toast.success("Marcado como rechazado");
    cerrar();
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && cerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rechazado</DialogTitle>
        </DialogHeader>
        <Campo id="motivo" etiqueta="Motivo (opcional)">
          <Textarea id="motivo" rows={3} placeholder="Precio, fecha, otra empresa…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button onClick={rechazar}>Marcar como rechazado</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DialogoCobro({ abierto, cerrar, presupuestoId, pendiente, reservaPendiente }: Abierto & {
  presupuestoId: string; pendiente: number | null; reservaPendiente: number | null;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoy);
  const [importe, setImporte] = useState("");
  const [concepto, setConcepto] = useState<keyof typeof CONCEPTOS_COBRO>(reservaPendiente ? "reserva" : "resto");
  const [notas, setNotas] = useState("");

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const valor = Number(importe.replace(",", "."));
    if (!(valor > 0)) return toast.error("Escribe el importe cobrado");
    const { error } = await crearClienteNavegador().from("cobros")
      .insert({ presupuesto_id: presupuestoId, fecha, importe: valor, concepto, notas: notas.trim() || null });
    if (error) return toast.error(error.message);
    toast.success("Cobro apuntado ✓");
    setImporte("");
    setNotas("");
    cerrar();
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && cerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apuntar cobro</DialogTitle>
          {pendiente !== null && <DialogDescription>Pendiente de cobro: {formatoEuros(pendiente)}</DialogDescription>}
        </DialogHeader>
        <form id="form-cobro" onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
          <Campo id="cobro-importe" etiqueta="Importe (€)">
            <Input id="cobro-importe" inputMode="decimal" autoFocus required value={importe} onChange={(e) => setImporte(e.target.value)} />
          </Campo>
          <Campo id="cobro-fecha" etiqueta="Fecha">
            <Input id="cobro-fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo id="cobro-concepto" etiqueta="Concepto" className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CONCEPTOS_COBRO).map(([valor, texto]) => (
                <button key={valor} type="button" aria-pressed={concepto === valor}
                  onClick={() => {
                    setConcepto(valor as keyof typeof CONCEPTOS_COBRO);
                    if (!importe && valor === "reserva" && reservaPendiente) setImporte(String(reservaPendiente));
                    if (!importe && valor === "resto" && pendiente) setImporte(String(pendiente));
                  }}
                  className={cn("rounded-full border px-3 py-1 text-sm", concepto === valor ? "border-foreground bg-foreground text-background" : "bg-background")}>
                  {texto}
                </button>
              ))}
            </div>
          </Campo>
          <Campo id="cobro-notas" etiqueta="Notas" className="sm:col-span-2">
            <Input id="cobro-notas" placeholder="Transferencia, Bizum…" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </Campo>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" form="form-cobro">Guardar cobro</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DialogoDatos({ abierto, cerrar, presupuesto }: Abierto & { presupuesto: Presupuesto }) {
  const listas = useListas();
  const p = presupuesto;
  const [precision, setPrecision] = useState<PrecisionFecha>(p.fecha_precision);
  const [fecha, setFecha] = useState(p.fecha_precision === "dia" ? p.fecha_evento ?? "" : "");
  const [mes, setMes] = useState(p.fecha_precision === "mes" ? (p.fecha_evento ?? "").slice(0, 7) : "");
  const [fechaFin, setFechaFin] = useState(p.fecha_fin ?? "");
  const [campos, setCampos] = useState({
    cliente: p.cliente?.nombre ?? "",
    tipo_evento: p.tipo_evento ?? "",
    ubicacion: p.ubicacion ?? "",
    provincia: p.provincia ?? "",
    material: p.material ?? "",
    comercial_id: p.comercial_id ?? "",
    intermediario_id: p.intermediario_id ?? "",
    comision_pct: p.comision_pct !== null ? String(p.comision_pct) : "",
    reserva_pct: p.reserva_pct !== null ? String(p.reserva_pct) : "",
    plantilla: p.plantilla,
  });
  const set = (k: keyof typeof campos, v: string) => setCampos({ ...campos, [k]: v });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const fechaEvento = precision === "dia" ? fecha : precision === "mes" && mes ? `${mes}-01` : null;
    if (precision !== "por_definir" && !fechaEvento) return toast.error("Falta la fecha");
    const sb = crearClienteNavegador();
    const { error } = await sb.from("presupuestos").update({
      tipo_evento: campos.tipo_evento || null,
      fecha_precision: precision,
      fecha_evento: fechaEvento,
      fecha_fin: precision === "dia" && fechaFin ? fechaFin : null,
      ubicacion: campos.ubicacion.trim() || null,
      provincia: campos.provincia.trim() || null,
      material: campos.material.trim() || null,
      comercial_id: campos.comercial_id || null,
      intermediario_id: campos.intermediario_id || null,
      comision_pct: campos.intermediario_id && campos.comision_pct !== "" ? Number(campos.comision_pct) : null,
      reserva_pct: campos.reserva_pct !== "" ? Number(campos.reserva_pct) : null,
      plantilla: campos.plantilla,
    }).eq("id", p.id);
    if (error) return toast.error(error.message);
    if (p.cliente && campos.cliente.trim() && campos.cliente.trim() !== p.cliente.nombre) {
      const r = await sb.from("clientes").update({ nombre: campos.cliente.trim() }).eq("id", p.cliente.id);
      if (r.error) return toast.error(r.error.message);
    }
    toast.success("Guardado ✓");
    cerrar();
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && cerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar datos de {p.codigo}</DialogTitle>
          <DialogDescription>Si cambian la fecha o el cliente, en la Fase 4 el CRM propondrá mover o renombrar la carpeta.</DialogDescription>
        </DialogHeader>
        <form id="form-datos" onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
          <Campo id="d-cliente" etiqueta="Cliente" className="sm:col-span-2">
            <Input id="d-cliente" value={campos.cliente} onChange={(e) => set("cliente", e.target.value)} />
          </Campo>
          <Campo id="d-tipo" etiqueta="Tipo de evento">
            <select id="d-tipo" className={claseSelect} value={campos.tipo_evento} onChange={(e) => set("tipo_evento", e.target.value)}>
              {listas.tiposEvento.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
            </select>
          </Campo>
          <Campo id="d-precision" etiqueta="Fecha">
            <select id="d-precision" className={claseSelect} value={precision} onChange={(e) => setPrecision(e.target.value as PrecisionFecha)}>
              <option value="dia">Fecha exacta</option>
              <option value="mes">Solo mes y año</option>
              <option value="por_definir">Por definir</option>
            </select>
          </Campo>
          {precision === "dia" && (
            <>
              <Campo id="d-fecha" etiqueta="Fecha del evento">
                <Input id="d-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </Campo>
              <Campo id="d-fin" etiqueta="Fecha de fin">
                <Input id="d-fin" type="date" min={fecha} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
              </Campo>
            </>
          )}
          {precision === "mes" && (
            <Campo id="d-mes" etiqueta="Mes previsto">
              <Input id="d-mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
            </Campo>
          )}
          <Campo id="d-ubicacion" etiqueta="Ubicación">
            <Input id="d-ubicacion" value={campos.ubicacion} onChange={(e) => set("ubicacion", e.target.value)} />
          </Campo>
          <Campo id="d-provincia" etiqueta="Provincia">
            <Input id="d-provincia" value={campos.provincia} onChange={(e) => set("provincia", e.target.value)} />
          </Campo>
          <Campo id="d-material" etiqueta="Material" className="sm:col-span-2">
            <Textarea id="d-material" rows={2} value={campos.material} onChange={(e) => set("material", e.target.value)} />
          </Campo>
          <Campo id="d-comercial" etiqueta="Comercial">
            <select id="d-comercial" className={claseSelect} value={campos.comercial_id} onChange={(e) => set("comercial_id", e.target.value)}>
              <option value="">—</option>
              {listas.comerciales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
          <Campo id="d-reserva" etiqueta="% de reserva">
            <Input id="d-reserva" type="number" min={0} max={100} value={campos.reserva_pct} onChange={(e) => set("reserva_pct", e.target.value)} />
          </Campo>
          <Campo id="d-intermediario" etiqueta="Intermediario">
            <select id="d-intermediario" className={claseSelect} value={campos.intermediario_id} onChange={(e) => set("intermediario_id", e.target.value)}>
              <option value="">Ninguno</option>
              {listas.intermediarios.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>
          </Campo>
          <Campo id="d-comision" etiqueta="Comisión %">
            <Input id="d-comision" type="number" min={0} max={100} step="0.5" disabled={!campos.intermediario_id}
              value={campos.comision_pct} onChange={(e) => set("comision_pct", e.target.value)} />
          </Campo>
          <Campo id="d-plantilla" etiqueta="Plantilla">
            <select id="d-plantilla" className={claseSelect} value={campos.plantilla} onChange={(e) => set("plantilla", e.target.value)}>
              <option value="carpadiem">Carpa Diem</option>
              <option value="neutra">Neutra</option>
            </select>
          </Campo>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" form="form-datos">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DialogoContacto({ abierto, cerrar, clienteId }: Abierto & { clienteId: string }) {
  const listas = useListas();
  const [c, setC] = useState({ nombre: "", rol: "", telefono: "", email: "" });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const { error } = await crearClienteNavegador().from("contactos").insert({
      cliente_id: clienteId, nombre: c.nombre.trim(), rol: c.rol || null,
      telefono: c.telefono.trim() || null, email: c.email.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Contacto añadido ✓");
    setC({ nombre: "", rol: "", telefono: "", email: "" });
    cerrar();
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && cerrar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo contacto</DialogTitle></DialogHeader>
        <form id="form-contacto" onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
          <Campo id="c-nombre" etiqueta="Nombre"><Input id="c-nombre" required autoFocus value={c.nombre} onChange={(e) => setC({ ...c, nombre: e.target.value })} /></Campo>
          <Campo id="c-rol" etiqueta="Rol">
            <select id="c-rol" className={claseSelect} value={c.rol} onChange={(e) => setC({ ...c, rol: e.target.value })}>
              <option value="">—</option>
              {listas.rolesContacto.map((r) => <option key={r.codigo} value={r.codigo}>{r.nombre}</option>)}
            </select>
          </Campo>
          <Campo id="c-tel" etiqueta="Teléfono"><Input id="c-tel" type="tel" value={c.telefono} onChange={(e) => setC({ ...c, telefono: e.target.value })} /></Campo>
          <Campo id="c-email" etiqueta="Email"><Input id="c-email" type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></Campo>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" form="form-contacto">Añadir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
