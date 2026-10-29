"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { MapPin, Phone } from "lucide-react";
import { Campo, claseSelect } from "@/components/campo";
import { Etiqueta, EtiquetaEstado, CLASE_CONFIRMADO, CLASE_SEGURO } from "@/components/etiqueta-estado";
import { HistorialDialogo } from "@/components/historial-dialogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { nombreDe, useListas } from "@/hooks/use-listas";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { SELECT_EVENTO, uno, type Contacto, type Evento } from "@/lib/datos/tipos";
import { formatoEuros, formatoFecha } from "@/lib/formato";
import { diaSemana, enlaceMaps, fechaLimiteSeguro, textoFechaEvento, type PrecisionFecha } from "@/lib/negocio";
import { rangoOcupacion, solapesMaterial, type EventoOcupacion, type Solape } from "@/lib/operativa";
import { TarjetaMontaje } from "./montaje";
import {
  TarjetaControlMaterial, TarjetaMaterialReservado, type ItemInventario, type MovimientoMaterial, type ReservaMaterial,
} from "./material";

type Datos = {
  e: Evento;
  contactos: Contacto[];
  cobrado: number;
  montadores: string[];
  movimientos: MovimientoMaterial[];
  reservas: ReservaMaterial[];
  inventario: ItemInventario[];
  solapes: Solape[];
  diasSeguro: number;
};

function Tarjeta({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-3.5 flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-semibold">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

export function FichaEvento({ id }: { id: string }) {
  const listas = useListas();
  const [editar, setEditar] = useState(false);
  const { datos, cargando } = useTablaEnVivo<Datos>(
    ["eventos", "cobros", "contactos", "clientes", "presupuestos", "evento_montadores", "material_movimientos", "evento_material", "inventario"],
    async (sb) => {
      const { data, error } = await sb.from("eventos").select(SELECT_EVENTO).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return [];
      const [ct, co, mo, mv, res, inv, todos, aj] = await Promise.all([
        sb.from("contactos").select("id, nombre, rol, telefono, email").eq("cliente_id", data.cliente_id).is("deleted_at", null).order("orden"),
        data.presupuesto_id
          ? sb.from("cobros").select("importe").eq("presupuesto_id", data.presupuesto_id).is("deleted_at", null)
          : Promise.resolve({ data: [] as { importe: number }[] }),
        sb.from("evento_montadores").select("montador_id").eq("evento_id", id),
        sb.from("material_movimientos").select("id, material, cantidad, sentido, fecha, notas").eq("evento_id", id).is("deleted_at", null).order("created_at"),
        sb.from("evento_material").select("id, evento_id, inventario_id, cantidad"),
        sb.from("inventario").select("id, material, cantidad, unidad").is("deleted_at", null).order("material"),
        sb.from("eventos").select("id, fecha_precision, fecha_inicio, fecha_fin, montaje_inicio, desmontaje_inicio, desmontaje_fin, cliente:clientes(nombre)")
          .eq("estado", "activo").is("deleted_at", null),
        sb.from("ajustes").select("dias_limite_seguro").maybeSingle(),
      ]);
      const reservasTodas = (res.data ?? []) as (ReservaMaterial & { evento_id: string })[];
      const inventario = ((inv.data ?? []) as ItemInventario[]).map((i) => ({ ...i, cantidad: Number(i.cantidad) }));
      const ocupacion: EventoOcupacion[] = (todos.data ?? []).flatMap((ev) => {
        const rango = rangoOcupacion(ev);
        const material = reservasTodas.filter((r) => r.evento_id === ev.id).map((r) => ({ inventarioId: r.inventario_id, cantidad: Number(r.cantidad) }));
        return rango && material.length ? [{ id: ev.id, nombre: uno(ev.cliente)?.nombre ?? "Evento", ...rango, material }] : [];
      });
      return [{
        e: { ...data, cliente: uno(data.cliente), presupuesto: uno(data.presupuesto), importe: data.importe !== null ? Number(data.importe) : null } as Evento,
        contactos: (ct.data ?? []) as Contacto[],
        cobrado: (co.data ?? []).reduce((s, c) => s + Number(c.importe), 0),
        montadores: (mo.data ?? []).map((m) => m.montador_id as string),
        movimientos: (mv.data ?? []) as MovimientoMaterial[],
        reservas: reservasTodas.filter((r) => r.evento_id === id),
        inventario,
        solapes: solapesMaterial(ocupacion, inventario).filter((s) => s.eventoIds.includes(id)),
        diasSeguro: aj.data?.dias_limite_seguro ?? 10,
      }];
    },
  );

  const d = datos[0];
  if (cargando) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!d) return <p className="text-sm text-muted-foreground">Este evento no existe o está en la papelera.</p>;
  const { e, contactos, cobrado, montadores, movimientos, reservas, inventario, solapes } = d;
  const sb = crearClienteNavegador();
  const direccion = [e.ubicacion, e.provincia].filter(Boolean).join(", ");
  const limite = e.modalidad === "seguro" && e.fecha_precision === "dia" && e.fecha_inicio ? fechaLimiteSeguro(e.fecha_inicio, d.diasSeguro) : null;

  async function actualizar(cambios: Partial<Evento>, ok: string) {
    const { error } = await sb.from("eventos").update(cambios).eq("id", e.id);
    if (error) toast.error(error.message);
    else toast.success(ok);
  }

  return (
    <>
      <div className="mb-3.5 text-[13px] text-muted-foreground">
        <Link href="/eventos" className="hover:text-foreground">Eventos</Link> / {e.cliente?.nombre}
      </div>
      <div className="mb-7 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[1_1_360px] pr-12 md:pr-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-[32px] leading-tight md:text-[40px]">{e.cliente?.nombre}</h1>
            {e.estado === "activo"
              ? <Etiqueta className={`${e.modalidad === "seguro" ? CLASE_SEGURO : CLASE_CONFIRMADO} px-2.5 py-1 text-[13px]`}>{e.modalidad === "seguro" ? "Seguro de lluvia" : "Confirmado"}</Etiqueta>
              : <Etiqueta className="bg-muted px-2.5 py-1 text-[13px] text-muted-foreground">{e.estado === "cancelado" ? "Cancelado" : "Cancelado – reserva retenida"}</Etiqueta>}
          </div>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            {nombreDe(listas.tiposEvento, e.tipo_evento)} · {e.fecha_precision === "dia" && e.fecha_inicio ? `${diaSemana(e.fecha_inicio)} ` : ""}
            {textoFechaEvento(e.fecha_precision, e.fecha_inicio, e.fecha_fin)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditar(true)}>Editar</Button>
          <HistorialDialogo tabla="eventos" registroId={e.id} titulo={e.cliente?.nombre ?? "Evento"} />
        </div>
      </div>

      {e.modalidad === "seguro" && e.estado === "activo" && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-[#F3DFB8] bg-[#FDF3E1] p-4 text-sm text-[#5C3D07]">
          <div className="min-w-0 flex-1">
            <b className="font-semibold">Seguro de lluvia.</b>{" "}
            {limite ? `El cliente decide como tarde el ${formatoFecha(limite)} (${d.diasSeguro} días antes).` : "Pon la fecha exacta del evento para calcular el plazo."}
          </div>
          <Button variant="outline" className="bg-card" onClick={() => actualizar({ modalidad: "confirmado" }, "Pasa a Confirmado ✓")}>Sigue adelante</Button>
          <Button variant="outline" className="bg-card"
            onClick={() => window.confirm(`¿El cliente cancela? Carpa Diem se queda lo pagado (${formatoEuros(cobrado)}).`) &&
              actualizar({ estado: "cancelado_reserva_retenida", importe_retenido: cobrado }, "Cancelado – reserva retenida")}>
            Cancela
          </Button>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="grid gap-6">
          <Tarjeta titulo="Dónde y qué">
            <div className="grid gap-4 text-sm">
              <div>
                <div className="mb-0.5 text-xs text-muted-foreground">Ubicación</div>
                {direccion ? (
                  <a href={e.maps_url || enlaceMaps(direccion)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4" aria-hidden /> {direccion}
                  </a>
                ) : "—"}
              </div>
              <div>
                <div className="mb-0.5 text-xs text-muted-foreground">Material</div>
                {e.material || "—"}
              </div>
              <div>
                <div className="mb-0.5 text-xs text-muted-foreground">Comentarios</div>
                <p className="whitespace-pre-line">{e.comentarios || "—"}</p>
              </div>
            </div>
          </Tarjeta>
          <Tarjeta titulo="Contactos">
            {contactos.length === 0 && <p className="text-sm text-muted-foreground">Sin contactos.</p>}
            {contactos.map((c) => (
              <div key={c.id} className="flex items-center gap-3 border-t py-2.5 first:border-0">
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium">{c.nombre} <span className="font-normal text-muted-foreground">· {nombreDe(listas.rolesContacto, c.rol)}</span></div>
                  <div className="text-[13px] text-muted-foreground">{[c.telefono, c.email].filter(Boolean).join(" · ")}</div>
                </div>
                {c.telefono && <Button variant="ghost" size="icon" aria-label={`Llamar a ${c.nombre}`} render={<a href={`tel:${c.telefono}`} />}><Phone className="size-4" aria-hidden /></Button>}
              </div>
            ))}
          </Tarjeta>
        </div>
        <div className="grid gap-6">
          <Tarjeta titulo="Importe">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Importe</div><b className="font-semibold">{formatoEuros(e.importe)}</b></div>
              <div><div className="text-xs text-muted-foreground">Cobrado</div><b className="font-semibold">{formatoEuros(cobrado)}</b></div>
              <div><div className="text-xs text-muted-foreground">{e.estado === "cancelado_reserva_retenida" ? "Retenido" : "Pendiente"}</div>
                <b className="font-semibold">{e.estado === "cancelado_reserva_retenida" ? formatoEuros(e.importe_retenido) : formatoEuros(e.importe !== null ? Math.max(e.importe - cobrado, 0) : null)}</b></div>
            </div>
            {e.presupuesto && (
              <div className="mt-4 flex items-center gap-2 border-t pt-3 text-sm">
                Presupuesto <Link href={`/presupuestos/${e.presupuesto.id}`} className="font-semibold">{e.presupuesto.codigo}</Link>
                <EtiquetaEstado estado={e.presupuesto.estado} />
                <span className="ml-auto text-xs text-muted-foreground">Los cobros se apuntan en el presupuesto</span>
              </div>
            )}
          </Tarjeta>
          <TarjetaMontaje key={e.id + (e.montaje_inicio ?? "")} evento={e} contactos={contactos} montadoresAsignados={montadores} />
          <TarjetaMaterialReservado eventoId={e.id} reservas={reservas} inventario={inventario} solapes={solapes} />
          <TarjetaControlMaterial eventoId={e.id} movimientos={movimientos} inventario={inventario} />
        </div>
      </div>

      {editar && <DialogoEditarEvento evento={e} cerrar={() => setEditar(false)} />}
    </>
  );
}

function DialogoEditarEvento({ evento: e, cerrar }: { evento: Evento; cerrar: () => void }) {
  const [precision, setPrecision] = useState<PrecisionFecha>(e.fecha_precision);
  const [mes, setMes] = useState(e.fecha_precision === "mes" ? (e.fecha_inicio ?? "").slice(0, 7) : "");
  const [c, setC] = useState({
    fecha_inicio: e.fecha_precision === "dia" ? e.fecha_inicio ?? "" : "",
    fecha_fin: e.fecha_fin ?? "",
    ubicacion: e.ubicacion ?? "",
    provincia: e.provincia ?? "",
    maps_url: e.maps_url ?? "",
    material: e.material ?? "",
    comentarios: e.comentarios ?? "",
  });

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    const inicio = precision === "dia" ? c.fecha_inicio : precision === "mes" && mes ? `${mes}-01` : null;
    if (precision !== "por_definir" && !inicio) return toast.error("Falta la fecha");
    const { error } = await crearClienteNavegador().from("eventos").update({
      fecha_precision: precision,
      fecha_inicio: inicio || null,
      fecha_fin: precision === "dia" && c.fecha_fin ? c.fecha_fin : null,
      ubicacion: c.ubicacion.trim() || null,
      provincia: c.provincia.trim() || null,
      maps_url: c.maps_url.trim() || null,
      material: c.material.trim() || null,
      comentarios: c.comentarios.trim() || null,
    }).eq("id", e.id);
    if (error) return toast.error(error.message);
    toast.success("Guardado ✓");
    cerrar();
  }

  return (
    <Dialog open onOpenChange={(a) => !a && cerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar evento</DialogTitle>
          <DialogDescription>Los cambios de fecha, lugar y material pasan también al presupuesto. Para un proyecto de larga duración, pon la fecha de fin para que el material figure como ocupado.</DialogDescription>
        </DialogHeader>
        <form id="form-evento" onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
          <Campo id="e-precision" etiqueta="Fecha" className="sm:col-span-2">
            <select id="e-precision" className={claseSelect} value={precision} onChange={(x) => setPrecision(x.target.value as PrecisionFecha)}>
              <option value="dia">Fecha exacta</option>
              <option value="mes">Solo mes y año</option>
              <option value="por_definir">Por definir</option>
            </select>
          </Campo>
          {precision === "dia" && (
            <>
              <Campo id="e-ini" etiqueta="Fecha de inicio">
                <Input id="e-ini" type="date" value={c.fecha_inicio} onChange={(x) => setC({ ...c, fecha_inicio: x.target.value })} />
              </Campo>
              <Campo id="e-fin" etiqueta="Fecha de fin">
                <Input id="e-fin" type="date" min={c.fecha_inicio} value={c.fecha_fin} onChange={(x) => setC({ ...c, fecha_fin: x.target.value })} />
              </Campo>
            </>
          )}
          {precision === "mes" && (
            <Campo id="e-mes" etiqueta="Mes previsto">
              <Input id="e-mes" type="month" value={mes} onChange={(x) => setMes(x.target.value)} />
            </Campo>
          )}
          <Campo id="e-ubi" etiqueta="Ubicación"><Input id="e-ubi" value={c.ubicacion} onChange={(x) => setC({ ...c, ubicacion: x.target.value })} /></Campo>
          <Campo id="e-prov" etiqueta="Provincia"><Input id="e-prov" value={c.provincia} onChange={(x) => setC({ ...c, provincia: x.target.value })} /></Campo>
          <Campo id="e-maps" etiqueta="Enlace de Google Maps (opcional)" className="sm:col-span-2">
            <Input id="e-maps" type="url" placeholder="Si no se pone, se busca por la ubicación" value={c.maps_url} onChange={(x) => setC({ ...c, maps_url: x.target.value })} />
          </Campo>
          <Campo id="e-mat" etiqueta="Material" className="sm:col-span-2"><Textarea id="e-mat" rows={2} value={c.material} onChange={(x) => setC({ ...c, material: x.target.value })} /></Campo>
          <Campo id="e-com" etiqueta="Comentarios" className="sm:col-span-2"><Textarea id="e-com" rows={3} value={c.comentarios} onChange={(x) => setC({ ...c, comentarios: x.target.value })} /></Campo>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" form="form-evento">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
