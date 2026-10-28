"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Mail, MessageCircle, Phone, Plus, Share2, Trash2 } from "lucide-react";
import { EtiquetaEstado, Etiqueta, CLASE_CONFIRMADO, CLASE_SEGURO } from "@/components/etiqueta-estado";
import { HistorialDialogo } from "@/components/historial-dialogo";
import { Button } from "@/components/ui/button";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { nombreDe, useListas } from "@/hooks/use-listas";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { moverAPapelera } from "@/lib/datos/papelera";
import {
  CONCEPTOS_COBRO, SELECT_PRESUPUESTO, SELECT_PRESUPUESTO_LISTA, uno,
  type Cobro, type Contacto, type Presupuesto, type PresupuestoLista, type Version,
} from "@/lib/datos/tipos";
import { formatoEuros, formatoFecha, formatoFechaHora, formatoPorcentaje } from "@/lib/formato";
import {
  ESTADOS, ESTADOS_ACEPTADOS, ESTADOS_MANUALES, diaSemana, importeReserva,
  textoFechaEvento, type EstadoPresupuesto,
} from "@/lib/negocio";
import { DialogoAceptar, DialogoCobro, DialogoContacto, DialogoDatos, DialogoRechazar } from "./dialogos";
import { TarjetaDocumento } from "./tarjeta-documento";
import { cn } from "@/lib/utils";

type Datos = {
  p: Presupuesto;
  versiones: Version[];
  cobros: Cobro[];
  contactos: Contacto[];
  opciones: PresupuestoLista[];
  evento: { id: string; modalidad: "confirmado" | "seguro"; estado: string } | null;
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

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-xs text-muted-foreground">{etiqueta}</div>
      <div className="text-sm">{children || "—"}</div>
    </div>
  );
}

const telefonoWhatsapp = (tel: string) => {
  const limpio = tel.replace(/[^\d+]/g, "").replace(/^\+/, "");
  return limpio.length === 9 ? `34${limpio}` : limpio;
};

export function FichaPresupuesto({ id }: { id: string }) {
  const router = useRouter();
  const listas = useListas();
  const [dialogo, setDialogo] = useState<null | "aceptar" | "rechazar" | "cobro" | "datos" | "contacto">(null);
  const cerrar = () => setDialogo(null);

  const { datos, cargando, error } = useTablaEnVivo<Datos>(
    ["presupuestos", "presupuesto_versiones", "cobros", "contactos", "clientes", "eventos"],
    async (sb) => {
      const { data: p, error } = await sb.from("presupuestos").select(SELECT_PRESUPUESTO).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!p) return [];
      const [v, c, ct, op, ev] = await Promise.all([
        sb.from("presupuesto_versiones").select("*").eq("presupuesto_id", id).is("deleted_at", null).order("version", { ascending: false }),
        sb.from("cobros").select("id, fecha, importe, concepto, notas").eq("presupuesto_id", id).is("deleted_at", null).order("fecha"),
        sb.from("contactos").select("id, nombre, rol, telefono, email").eq("cliente_id", p.cliente_id).is("deleted_at", null).order("orden"),
        p.oportunidad_id
          ? sb.from("presupuestos").select(SELECT_PRESUPUESTO_LISTA).eq("oportunidad_id", p.oportunidad_id).is("deleted_at", null).order("numero")
          : Promise.resolve({ data: [] }),
        sb.from("eventos").select("id, modalidad, estado").eq("presupuesto_id", id).is("deleted_at", null).maybeSingle(),
      ]);
      return [{
        p: { ...p, cliente: uno(p.cliente), comercial: uno(p.comercial), intermediario: uno(p.intermediario) } as Presupuesto,
        versiones: (v.data ?? []) as Version[],
        cobros: ((c.data ?? []) as Cobro[]).map((x) => ({ ...x, importe: Number(x.importe) })),
        contactos: (ct.data ?? []) as Contacto[],
        opciones: (op.data ?? []) as unknown as PresupuestoLista[],
        evento: ev.data as Datos["evento"],
      }];
    },
  );

  const d = datos[0];
  if (cargando) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!d) return <p className="text-sm text-muted-foreground">Este presupuesto no existe o está en la papelera.</p>;

  const { p, versiones, cobros, contactos, opciones, evento } = d;
  const importe = p.importe !== null ? Number(p.importe) : null;
  const reservaPct = p.reserva_pct !== null ? Number(p.reserva_pct) : null;
  const cobrado = cobros.reduce((s, c) => s + c.importe, 0);
  const reserva = importeReserva(importe, reservaPct);
  const pendiente = importe !== null ? Math.max(importe - cobrado, 0) : null;
  const reservaPendiente = reserva !== null ? Math.max(reserva - cobrado, 0) : null;
  const ultimaVersion = versiones[0]?.version ?? 1;
  const aceptado = ESTADOS_ACEPTADOS.includes(p.estado);
  const cliente = p.cliente?.nombre ?? "";
  const sb = crearClienteNavegador();

  async function cambiarEstado(estado: EstadoPresupuesto | "aceptar") {
    if (estado === "aceptar") return setDialogo("aceptar");
    if (estado === "rechazado") return setDialogo("rechazar");
    const { error } = await sb.from("presupuestos").update({ estado }).eq("id", p.id);
    if (error) toast.error(error.message);
    else toast.success(`Estado: ${ESTADOS[estado].texto}`);
  }

  async function guardarImporte() {
    const texto = window.prompt(
      "Total SIN IVA del presupuesto (en la Fase 4 se leerá solo del PDF):",
      importe !== null ? String(importe).replace(".", ",") : "",
    );
    if (texto === null) return;
    const valor = Number(texto.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
    if (!(valor >= 0)) return toast.error("Importe no válido");
    const reservaTexto = reservaPct !== null ? ` · Reserva ${formatoPorcentaje(reservaPct)} = ${formatoEuros(importeReserva(valor, reservaPct))}` : "";
    if (!window.confirm(`Importe ${formatoEuros(valor)}${reservaTexto} — ¿Correcto?`)) return;
    const r1 = await sb.from("presupuestos").update({ importe: valor }).eq("id", p.id);
    const r2 = await sb.from("presupuesto_versiones").update({ importe: valor }).eq("presupuesto_id", p.id).eq("version", ultimaVersion);
    if (r1.error || r2.error) toast.error((r1.error ?? r2.error)!.message);
    else toast.success("Importe guardado ✓");
  }

  async function marcarEnviado() {
    const { error } = await sb.rpc("marcar_enviado", { p_id: p.id, p_version: ultimaVersion });
    if (error) toast.error(error.message);
    else toast.success(`V${String(ultimaVersion).padStart(2, "0")} marcada como enviada ✓`);
  }

  async function borrarCobro(c: Cobro) {
    if (!window.confirm(`¿Borrar el cobro de ${formatoEuros(c.importe)} del ${formatoFecha(c.fecha)}?`)) return;
    try {
      await moverAPapelera("cobros", c.id);
      toast.success("Cobro movido a la papelera");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo borrar");
    }
  }

  async function borrarPresupuesto() {
    if (!window.confirm(`¿Mover ${p.codigo} a la papelera? El administrador podrá restaurarlo.`)) return;
    try {
      await moverAPapelera("presupuestos", p.id);
      toast.success(`${p.codigo} movido a la papelera`);
      router.push("/presupuestos");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo borrar");
    }
  }

  // Acción principal según el estado
  const principal =
    p.estado === "borrador" ? <Button onClick={marcarEnviado}>Marcar como enviado</Button>
    : p.estado === "pendiente" || p.estado === "caducado" ? <Button onClick={() => setDialogo("aceptar")}>Aceptar</Button>
    : aceptado ? <Button onClick={() => setDialogo("cobro")}>+ Apuntar cobro</Button>
    : null;

  return (
    <>
      <div className="mb-3.5 text-[13px] text-muted-foreground">
        <Link href="/presupuestos" className="hover:text-foreground">Presupuestos</Link> / {p.codigo}
      </div>

      <div className="mb-7 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[1_1_360px] pr-12 md:pr-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-[32px] leading-tight md:text-[40px]">{p.codigo} · {cliente}</h1>
            <label className="relative">
              <span className="sr-only">Estado</span>
              <EtiquetaEstado estado={p.estado} className="pointer-events-none px-2.5 py-1 text-[13px] font-semibold" />
              <select
                aria-label="Cambiar estado"
                className="absolute inset-0 cursor-pointer opacity-0"
                value={p.estado}
                onChange={(e) => cambiarEstado(e.target.value as EstadoPresupuesto | "aceptar")}
              >
                {ESTADOS_MANUALES.map((e) => <option key={e} value={e}>{ESTADOS[e].texto}</option>)}
                {!aceptado && <option value="aceptar">Aceptado…</option>}
                {aceptado && <option value={p.estado}>{ESTADOS[p.estado].texto}</option>}
                {p.estado === "descartada" && <option value="descartada">Descartada</option>}
              </select>
            </label>
          </div>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            {nombreDe(listas.tiposEvento, p.tipo_evento)} · {p.fecha_precision === "dia" && p.fecha_evento ? `${diaSemana(p.fecha_evento)} ` : ""}
            {textoFechaEvento(p.fecha_precision, p.fecha_evento, p.fecha_fin)}
            {(p.ubicacion || p.provincia) && ` · ${[p.ubicacion, p.provincia].filter(Boolean).join(", ")}`}
          </p>
          {p.estado === "rechazado" && p.motivo_rechazo && (
            <p className="mt-1 text-sm text-muted-foreground">Motivo: {p.motivo_rechazo}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {principal}
          <Button variant="outline" render={<Link href={`/presupuestos/nuevo?duplicar=${p.id}`} />}>
            <Copy className="size-4" aria-hidden /> Duplicar para otro cliente
          </Button>
          <HistorialDialogo tabla="presupuestos" registroId={p.id} titulo={p.codigo} />
          <Button variant="ghost" size="icon" aria-label="Mover a la papelera" onClick={borrarPresupuesto}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      <AccionesMovil contacto={contactos[0]} versionPdf={versiones.find((v) => v.pdf_item_id || v.pdf_storage)} />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="grid gap-6">
          <TarjetaDocumento p={p} versiones={versiones} />

          <Tarjeta titulo="Datos" accion={<Button variant="outline" size="sm" onClick={() => setDialogo("datos")}>Editar</Button>}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Dato etiqueta="Tipo de cliente">{nombreDe(listas.tiposCliente, p.cliente?.tipo_cliente)}</Dato>
              <Dato etiqueta="Tipo de evento">{nombreDe(listas.tiposEvento, p.tipo_evento)}</Dato>
              <Dato etiqueta="Fecha">{textoFechaEvento(p.fecha_precision, p.fecha_evento, p.fecha_fin)}</Dato>
              <Dato etiqueta="Ubicación">{p.ubicacion}</Dato>
              <Dato etiqueta="Provincia">{p.provincia}</Dato>
              <Dato etiqueta="Comercial">{p.comercial?.nombre}</Dato>
              <Dato etiqueta="Intermediario">
                {p.intermediario && `${p.intermediario.nombre}${p.comision_pct !== null ? ` · ${formatoPorcentaje(Number(p.comision_pct))}` : ""}`}
              </Dato>
              <Dato etiqueta="% de reserva">{reservaPct !== null && formatoPorcentaje(reservaPct)}</Dato>
              <Dato etiqueta="Plantilla">{p.plantilla === "neutra" ? "Neutra" : "Carpa Diem"}</Dato>
            </div>
            <div className="mt-4 border-t pt-4">
              <Dato etiqueta="Material">{p.material}</Dato>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Contactos" accion={<Button variant="outline" size="sm" onClick={() => setDialogo("contacto")}><Plus className="size-4" aria-hidden /> Añadir</Button>}>
            {contactos.length === 0 && <p className="text-sm text-muted-foreground">Sin contactos.</p>}
            <ul>
              {contactos.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 border-t py-2.5 first:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{c.nombre} <span className="font-normal text-muted-foreground">· {nombreDe(listas.rolesContacto, c.rol)}</span></div>
                    <div className="text-[13px] text-muted-foreground">{[c.telefono, c.email].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="flex gap-1">
                    {c.telefono && <Button variant="ghost" size="icon" aria-label={`Llamar a ${c.nombre}`} render={<a href={`tel:${c.telefono}`} />}><Phone className="size-4" aria-hidden /></Button>}
                    {c.telefono && <Button variant="ghost" size="icon" aria-label={`WhatsApp a ${c.nombre}`} render={<a href={`https://wa.me/${telefonoWhatsapp(c.telefono)}`} target="_blank" rel="noreferrer" />}><MessageCircle className="size-4" aria-hidden /></Button>}
                    {c.email && <Button variant="ghost" size="icon" aria-label={`Email a ${c.nombre}`} render={<a href={`mailto:${c.email}`} />}><Mail className="size-4" aria-hidden /></Button>}
                  </div>
                </li>
              ))}
            </ul>
          </Tarjeta>
        </div>

        <div className="grid gap-6">
          <Tarjeta titulo="Importe y cobros" accion={<Button variant="outline" size="sm" onClick={guardarImporte}>{importe === null ? "Poner importe" : "Cambiar"}</Button>}>
            <div className="text-[34px] font-semibold tracking-tight">{formatoEuros(importe)}</div>
            <div className="text-[13px] text-muted-foreground">Total sin IVA</div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Dato etiqueta={`Reserva ${reservaPct !== null ? formatoPorcentaje(reservaPct) : ""}`}><b className="font-semibold">{formatoEuros(reserva)}</b></Dato>
              <Dato etiqueta="Cobrado"><b className="font-semibold">{formatoEuros(cobrado)}</b></Dato>
              <Dato etiqueta="Pendiente"><b className="font-semibold text-[#B0302A]">{formatoEuros(pendiente)}</b></Dato>
            </div>
            {importe !== null && importe > 0 && (
              <div className="relative mt-4 h-1.5 rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min((cobrado / importe) * 100, 100)}%` }} />
                {reservaPct !== null && <div className="absolute -top-1 h-3.5 w-0.5 bg-[#8A5A0B]" style={{ left: `${reservaPct}%` }} />}
              </div>
            )}
            {cobros.length > 0 && (
              <ul className="mt-4">
                {cobros.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 border-t py-2 text-sm">
                    <span className="w-24 text-muted-foreground">{formatoFecha(c.fecha)}</span>
                    <span className="flex-1">{CONCEPTOS_COBRO[c.concepto]}{c.notas && <span className="text-muted-foreground"> · {c.notas}</span>}</span>
                    <span className="font-medium">{formatoEuros(c.importe)}</span>
                    <Button variant="ghost" size="icon-sm" aria-label="Borrar cobro" onClick={() => borrarCobro(c)}><Trash2 className="size-3.5" aria-hidden /></Button>
                  </li>
                ))}
              </ul>
            )}
            {aceptado ? (
              <Button variant="outline" className="mt-4 w-full" onClick={() => setDialogo("cobro")}>+ Apuntar cobro</Button>
            ) : (
              <p className="mt-4 text-[13px] text-muted-foreground">Los cobros se apuntan cuando el presupuesto está aceptado.</p>
            )}
          </Tarjeta>

          <Tarjeta titulo="Envío" accion={p.estado !== "borrador" && <Button variant="outline" size="sm" onClick={marcarEnviado}>Marcar V{String(ultimaVersion).padStart(2, "0")} como enviada</Button>}>
            {p.enviado_at ? (
              <p className="text-sm">V{String(p.version_enviada).padStart(2, "0")} marcada como enviada el {formatoFechaHora(p.enviado_at)}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no se ha enviado. Envíalo por Outlook y pulsa “Marcar como enviado”.</p>
            )}
          </Tarjeta>

          {evento && (
            <Tarjeta titulo="Evento">
              <div className="flex items-center gap-3">
                <Etiqueta className={evento.modalidad === "seguro" ? CLASE_SEGURO : CLASE_CONFIRMADO}>
                  {evento.modalidad === "seguro" ? "Seguro" : "Confirmado"}
                </Etiqueta>
                {evento.estado !== "activo" && <Etiqueta className="bg-muted text-muted-foreground">Cancelado</Etiqueta>}
                <Link href={`/eventos/${evento.id}`} className="ml-auto text-sm">Ver evento</Link>
              </div>
            </Tarjeta>
          )}

          <Tarjeta
            titulo="Opciones de esta oportunidad"
            accion={<Button variant="outline" size="sm" render={<Link href={`/presupuestos/nuevo?opcion=${p.id}`} />}><Plus className="size-4" aria-hidden /> Otra opción</Button>}
          >
            <ul>
              {opciones.map((o) => (
                <li key={o.id} className="flex items-center gap-2.5 border-t py-2.5 text-sm first:border-0">
                  {o.id === p.id
                    ? <span className="font-semibold">{o.codigo}</span>
                    : <Link href={`/presupuestos/${o.id}`} className="font-semibold">{o.codigo}</Link>}
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{o.material}</span>
                  <span>{formatoEuros(o.importe !== null ? Number(o.importe) : null)}</span>
                  <EtiquetaEstado estado={o.estado} />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Al aceptar una, las demás pasan a “Descartada”.</p>
          </Tarjeta>
        </div>
      </div>

      <DialogoAceptar abierto={dialogo === "aceptar"} cerrar={cerrar} presupuesto={p} />
      <DialogoRechazar abierto={dialogo === "rechazar"} cerrar={cerrar} presupuesto={p} />
      <DialogoCobro abierto={dialogo === "cobro"} cerrar={cerrar} presupuestoId={p.id} pendiente={pendiente} reservaPendiente={reservaPendiente || null} />
      {dialogo === "datos" && <DialogoDatos abierto cerrar={cerrar} presupuesto={p} />}
      <DialogoContacto abierto={dialogo === "contacto"} cerrar={cerrar} clienteId={p.cliente_id} />
    </>
  );
}

// Móvil: llamar, escribir y compartir el PDF con un toque
function AccionesMovil({ contacto, versionPdf }: { contacto?: Contacto; versionPdf?: Version }) {
  async function compartir() {
    if (!versionPdf) return;
    try {
      const r = await fetch(`/api/pdf/${versionPdf.id}`);
      if (!r.ok) throw new Error("No se pudo descargar el PDF");
      const nombre = (versionPdf.nombre_archivo ?? "presupuesto").replace(/\.docx$/i, "") + ".pdf";
      const archivo = new File([await r.blob()], nombre.replace(/\.pdf\.pdf$/, ".pdf"), { type: "application/pdf" });
      if (navigator.canShare?.({ files: [archivo] })) await navigator.share({ files: [archivo], title: archivo.name });
      else window.open(`/api/pdf/${versionPdf.id}?ver=1`, "_blank");
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") toast.error(e.message);
    }
  }

  const boton = "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl border bg-card text-xs font-medium text-foreground";
  return (
    <div className="mb-5 flex gap-2 md:hidden">
      <button type="button" className={cn(boton, "border-primary bg-primary text-primary-foreground")} disabled={!versionPdf} onClick={compartir}>
        <Share2 className="size-5" aria-hidden /> {versionPdf ? "Compartir PDF" : "Sin PDF"}
      </button>
      {contacto?.telefono && (
        <a className={boton} href={`tel:${contacto.telefono}`}><Phone className="size-5" aria-hidden /> Llamar</a>
      )}
      {contacto?.telefono && (
        <a className={boton} href={`https://wa.me/${telefonoWhatsapp(contacto.telefono)}`} target="_blank" rel="noreferrer">
          <MessageCircle className="size-5" aria-hidden /> WhatsApp
        </a>
      )}
      {contacto?.email && (
        <a className={boton} href={`mailto:${contacto.email}`}><Mail className="size-5" aria-hidden /> Email</a>
      )}
    </div>
  );
}
