"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Cabecera } from "@/components/cabecera";
import { Campo, claseSelect } from "@/components/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useListas } from "@/hooks/use-listas";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { uno } from "@/lib/datos/tipos";
import { crearDocumento, estadoSharePoint } from "@/lib/documentos";
import { leerFechaAprox, type PrecisionFecha } from "@/lib/negocio";
import { cn } from "@/lib/utils";

type ContactoForm = { nombre: string; rol: string; telefono: string; email: string };
type ClienteExistente = { id: string; nombre: string; tipo_cliente: string | null };

const contactoVacio = (): ContactoForm => ({ nombre: "", rol: "", telefono: "", email: "" });

type Props = { nombreUsuario: string; leadId?: string; duplicarId?: string; opcionDeId?: string };

export function FormularioPresupuesto({ nombreUsuario, leadId, duplicarId, opcionDeId }: Props) {
  const router = useRouter();
  const listas = useListas();

  const [clienteNombre, setClienteNombre] = useState("");
  const [cliente, setCliente] = useState<ClienteExistente | null>(null);
  const [oportunidadId, setOportunidadId] = useState<string | null>(null);
  const [tipoCliente, setTipoCliente] = useState("particular");
  const [contactos, setContactos] = useState<ContactoForm[]>([contactoVacio()]);
  const [tipoEvento, setTipoEvento] = useState("boda");
  const [intermediarioId, setIntermediarioId] = useState("");
  const [comision, setComision] = useState("");
  const [precision, setPrecision] = useState<PrecisionFecha>("dia");
  const [fecha, setFecha] = useState("");
  const [mes, setMes] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [provincia, setProvincia] = useState("");
  const [material, setMaterial] = useState("");
  const [comercialId, setComercialId] = useState("");
  const [reserva, setReserva] = useState<string | null>(null);
  const [plantilla, setPlantilla] = useState<"carpadiem" | "neutra">("carpadiem");
  const [guardando, setGuardando] = useState(false);
  const [sugerencias, setSugerencias] = useState<ClienteExistente[]>([]);
  const [origen, setOrigen] = useState<string | null>(null);

  // Comercial por defecto: el que se llama como el usuario (mientras no se elija otro)
  const comercialPropio = listas.comerciales.find((c) => c.nombre.toLowerCase() === nombreUsuario.split(" ")[0].toLowerCase());
  const comercialMostrado = comercialId || comercialPropio?.id || "";

  // % de reserva por defecto según el tipo de cliente (si no se ha tocado a mano)
  const reservaPorDefecto = listas.tiposCliente.find((t) => t.codigo === tipoCliente)?.reserva_pct ?? null;
  const reservaMostrada = reserva ?? (reservaPorDefecto !== null ? String(reservaPorDefecto) : "");

  // Rellenar desde un lead, un presupuesto a duplicar o como otra opción del mismo cliente
  useEffect(() => {
    const sb = crearClienteNavegador();
    if (leadId) {
      sb.from("leads").select("*").eq("id", leadId).maybeSingle().then(({ data: l }) => {
        if (!l) return;
        // Lo que no tiene campo propio se ve en el subtítulo para no perderlo
        const extra = [l.fecha_evento_aprox && `fecha aprox.: ${l.fecha_evento_aprox}`, l.comentarios].filter(Boolean).join(" · ");
        setOrigen(`Desde el lead de ${l.cliente_nombre}${extra ? ` — ${extra}` : ""}`);
        setClienteNombre(l.cliente_nombre ?? "");
        // Si el lead ya tiene cliente, se usa el mismo (no se duplica)
        if (l.cliente_id) {
          sb.from("clientes").select("id, nombre, tipo_cliente").eq("id", l.cliente_id).maybeSingle()
            .then(({ data: c }) => { if (c) setCliente(c as ClienteExistente); });
        }
        const f = leerFechaAprox(l.fecha_evento_aprox ?? "");
        if (f) {
          setPrecision(f.precision);
          if (f.precision === "dia") setFecha(f.fecha);
          else setMes(f.fecha.slice(0, 7));
        }
        if (l.tipo_cliente) setTipoCliente(l.tipo_cliente);
        if (l.comercial_id) setComercialId(l.comercial_id);
        setContactos([{ nombre: l.contacto_nombre ?? l.cliente_nombre ?? "", rol: "", telefono: l.telefono ?? "", email: l.email ?? "" }]);
        setUbicacion(l.lugar_aprox ?? "");
        setMaterial(l.que_pide ?? "");
      });
    }
    const copiarDe = duplicarId ?? opcionDeId;
    if (copiarDe) {
      sb.from("presupuestos").select("*, cliente:clientes(id, nombre, tipo_cliente)").eq("id", copiarDe).maybeSingle().then(({ data: p }) => {
        if (!p) return;
        setTipoEvento(p.tipo_evento ?? "boda");
        setMaterial(p.material ?? "");
        setPlantilla(p.plantilla);
        if (p.reserva_pct !== null) setReserva(String(p.reserva_pct));
        if (opcionDeId) {
          // Otra opción: mismo cliente, misma oportunidad, misma fecha y lugar
          const c = uno(p.cliente) as ClienteExistente | null;
          setOrigen(`Nueva opción para ${c?.nombre} (como ${p.codigo})`);
          setCliente(c);
          setClienteNombre(c?.nombre ?? "");
          if (c?.tipo_cliente) setTipoCliente(c.tipo_cliente);
          setOportunidadId(p.oportunidad_id);
          setContactos([]);
          setPrecision(p.fecha_precision);
          if (p.fecha_precision === "dia") setFecha(p.fecha_evento ?? "");
          if (p.fecha_precision === "mes") setMes((p.fecha_evento ?? "").slice(0, 7));
          setFechaFin(p.fecha_fin ?? "");
          setUbicacion(p.ubicacion ?? "");
          setProvincia(p.provincia ?? "");
          setIntermediarioId(p.intermediario_id ?? "");
          setComision(p.comision_pct !== null ? String(p.comision_pct) : "");
        } else {
          setOrigen(`Duplicado de ${p.codigo} para otro cliente`);
          setProvincia(p.provincia ?? "");
        }
      });
    }
  }, [leadId, duplicarId, opcionDeId]);

  // Avisar si el cliente ya existe, para no duplicarlo
  useEffect(() => {
    const nombre = clienteNombre.trim();
    if (cliente || nombre.length < 3) return;
    const t = setTimeout(async () => {
      const { data } = await crearClienteNavegador()
        .from("clientes").select("id, nombre, tipo_cliente").is("deleted_at", null).ilike("nombre", `%${nombre}%`).limit(5);
      setSugerencias((data ?? []) as ClienteExistente[]);
    }, 250);
    return () => clearTimeout(t);
  }, [clienteNombre, cliente]);

  const intermediario = useMemo(() => listas.intermediarios.find((i) => i.id === intermediarioId), [listas.intermediarios, intermediarioId]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!cliente && !clienteNombre.trim()) {
      toast.error("Falta el cliente");
      return;
    }
    const fechaEvento = precision === "dia" ? fecha : precision === "mes" && mes ? `${mes}-01` : "";
    if (precision !== "por_definir" && !fechaEvento) {
      toast.error(precision === "dia" ? "Falta la fecha del evento" : "Falta el mes del evento");
      return;
    }
    setGuardando(true);
    const { data, error } = await crearClienteNavegador().rpc("crear_presupuesto", {
      p: {
        cliente_id: cliente?.id ?? "",
        cliente_nombre: clienteNombre.trim(),
        tipo_cliente: tipoCliente,
        contactos,
        oportunidad_id: oportunidadId ?? "",
        lead_id: leadId ?? "",
        tipo_evento: tipoEvento,
        intermediario_id: intermediarioId,
        comision_pct: comision,
        fecha_precision: precision,
        fecha_evento: fechaEvento,
        fecha_fin: precision === "dia" ? fechaFin : "",
        ubicacion,
        provincia,
        material,
        comercial_id: comercialMostrado,
        reserva_pct: reservaMostrada,
        plantilla,
      },
    });
    setGuardando(false);
    if (error || !data) {
      toast.error(`No se pudo crear: ${error?.message ?? "error desconocido"}`);
      return;
    }
    const creado = data as { id: string; codigo: string };
    toast.success(`${creado.codigo} creado ✓`);

    // Carpeta + Word en SharePoint (si falla, el presupuesto ya está creado y se puede reintentar)
    const sp = await estadoSharePoint().catch(() => null);
    if (sp?.configurado) {
      const id = toast.loading("Creando la carpeta y el Word…");
      const doc = await crearDocumento(creado.id, duplicarId);
      if (doc.ok) {
        toast.success(`${doc.nombre} creado ✓ · abriendo Word…`, { id });
        if (doc.aviso) toast.warning(doc.aviso, { duration: 20000 });
        window.location.href = doc.escritorio;
      } else {
        toast.error(`El presupuesto está creado, pero el Word no: ${doc.error}`, { id });
      }
    }
    router.push(`/presupuestos/${creado.id}`);
  }

  const cambiarContacto = (i: number, campo: keyof ContactoForm, valor: string) =>
    setContactos(contactos.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)));

  return (
    <form onSubmit={guardar} className="max-w-3xl">
      <Cabecera titulo="Nuevo presupuesto" subtitulo={origen ?? "El número se asigna al guardar"} />

      <div className="grid gap-6">
        <section className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
          <h2 className="text-[15px] font-semibold sm:col-span-2">Cliente</h2>
          <Campo id="cliente" etiqueta="Cliente" className="sm:col-span-2">
            {cliente ? (
              <div className="flex h-8 items-center gap-2 rounded-lg border bg-muted px-2.5 text-sm">
                <span className="flex-1">{cliente.nombre} <span className="text-muted-foreground">· cliente existente</span></span>
                {!opcionDeId && (
                  <button type="button" aria-label="Cambiar cliente" onClick={() => { setCliente(null); }}>
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            ) : (
              <>
                <Input id="cliente" required autoFocus placeholder="Nombre y apellidos o empresa" value={clienteNombre}
                  onChange={(e) => setClienteNombre(e.target.value)} />
                {sugerencias.length > 0 && clienteNombre.trim().length >= 3 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
                    ¿Es uno de estos?
                    {sugerencias.map((s) => (
                      <button key={s.id} type="button" className="rounded-full border bg-background px-2.5 py-0.5 text-foreground hover:bg-muted"
                        onClick={() => { setCliente(s); setClienteNombre(s.nombre); if (s.tipo_cliente) setTipoCliente(s.tipo_cliente); }}>
                        {s.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </Campo>
          <Campo id="tipo-cliente" etiqueta="Tipo de cliente">
            <select id="tipo-cliente" className={claseSelect} value={tipoCliente} onChange={(e) => { setTipoCliente(e.target.value); setReserva(null); }}>
              {listas.tiposCliente.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
            </select>
          </Campo>
          <Campo id="tipo-evento" etiqueta="Tipo de evento">
            <select id="tipo-evento" className={claseSelect} value={tipoEvento} onChange={(e) => setTipoEvento(e.target.value)}>
              {listas.tiposEvento.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
            </select>
          </Campo>

          <div className="grid gap-3 sm:col-span-2">
            <div className="text-sm font-medium">{cliente ? "Contactos nuevos (opcional)" : "Contactos"}</div>
            {contactos.map((c, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1.3fr_1fr_1fr_1.3fr_auto]">
                <Input aria-label="Nombre del contacto" placeholder="Nombre" value={c.nombre} onChange={(e) => cambiarContacto(i, "nombre", e.target.value)} />
                <select aria-label="Rol" className={claseSelect} value={c.rol} onChange={(e) => cambiarContacto(i, "rol", e.target.value)}>
                  <option value="">Rol…</option>
                  {listas.rolesContacto.map((r) => <option key={r.codigo} value={r.codigo}>{r.nombre}</option>)}
                </select>
                <Input aria-label="Teléfono" type="tel" placeholder="Teléfono" value={c.telefono} onChange={(e) => cambiarContacto(i, "telefono", e.target.value)} />
                <Input aria-label="Email" type="email" placeholder="Email" value={c.email} onChange={(e) => cambiarContacto(i, "email", e.target.value)} />
                <Button type="button" variant="ghost" size="icon" aria-label="Quitar contacto" onClick={() => setContactos(contactos.filter((_, j) => j !== i))}>
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setContactos([...contactos, contactoVacio()])}>
              <Plus className="size-4" aria-hidden /> Añadir contacto
            </Button>
          </div>
        </section>

        <section className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
          <h2 className="text-[15px] font-semibold sm:col-span-2">Evento</h2>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium">Fecha del evento</legend>
            <div className="flex flex-wrap gap-1.5">
              {([["dia", "Fecha exacta"], ["mes", "Solo mes y año"], ["por_definir", "Por definir"]] as const).map(([valor, texto]) => (
                <button key={valor} type="button" aria-pressed={precision === valor} onClick={() => setPrecision(valor)}
                  className={cn("rounded-full border px-3 py-1 text-sm", precision === valor ? "border-foreground bg-foreground text-background" : "bg-background")}>
                  {texto}
                </button>
              ))}
            </div>
          </fieldset>
          {precision === "dia" && (
            <>
              <Campo id="fecha" etiqueta="Fecha">
                <Input id="fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </Campo>
              <Campo id="fecha-fin" etiqueta="Fecha de fin (si dura varios días)">
                <Input id="fecha-fin" type="date" min={fecha} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
              </Campo>
            </>
          )}
          {precision === "mes" && (
            <Campo id="mes" etiqueta="Mes previsto">
              <Input id="mes" type="month" required value={mes} onChange={(e) => setMes(e.target.value)} />
            </Campo>
          )}
          <Campo id="ubicacion" etiqueta="Ubicación">
            <Input id="ubicacion" placeholder="Finca, dirección o pueblo" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />
          </Campo>
          <Campo id="provincia" etiqueta="Provincia">
            <Input id="provincia" value={provincia} onChange={(e) => setProvincia(e.target.value)} />
          </Campo>
          <Campo id="material" etiqueta="Descripción breve del material" className="sm:col-span-2">
            <Textarea id="material" rows={2} placeholder="2 beduinas 12x15 + tarima 72 m²" value={material} onChange={(e) => setMaterial(e.target.value)} />
          </Campo>
        </section>

        <section className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
          <h2 className="text-[15px] font-semibold sm:col-span-2">Venta</h2>
          <Campo id="comercial" etiqueta="Comercial">
            <select id="comercial" className={claseSelect} value={comercialMostrado} onChange={(e) => setComercialId(e.target.value)}>
              <option value="">—</option>
              {listas.comerciales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
          <Campo id="reserva" etiqueta="% de reserva">
            <Input id="reserva" type="number" inputMode="decimal" min={0} max={100} step="1" value={reservaMostrada}
              placeholder={reservaPorDefecto === null ? "Sin valor por defecto" : undefined}
              onChange={(e) => setReserva(e.target.value)} />
          </Campo>
          <Campo id="intermediario" etiqueta="Intermediario (opcional)">
            <select id="intermediario" className={claseSelect} value={intermediarioId}
              onChange={(e) => {
                setIntermediarioId(e.target.value);
                const i = listas.intermediarios.find((x) => x.id === e.target.value);
                setComision(i?.comision_pct != null ? String(i.comision_pct) : "");
              }}>
              <option value="">Ninguno</option>
              {listas.intermediarios.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>
          </Campo>
          <Campo id="comision" etiqueta="Comisión %">
            <Input id="comision" type="number" inputMode="decimal" min={0} max={100} step="0.5" disabled={!intermediario}
              value={comision} onChange={(e) => setComision(e.target.value)} />
          </Campo>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium">Plantilla</legend>
            <div className="flex gap-1.5">
              {([["carpadiem", "Carpa Diem"], ["neutra", "Neutra"]] as const).map(([valor, texto]) => (
                <button key={valor} type="button" aria-pressed={plantilla === valor} onClick={() => setPlantilla(valor)}
                  className={cn("rounded-full border px-3 py-1 text-sm", plantilla === valor ? "border-foreground bg-foreground text-background" : "bg-background")}>
                  {texto}
                </button>
              ))}
            </div>
          </fieldset>
        </section>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" render={<Link href="/presupuestos" />}>Cancelar</Button>
          <Button type="submit" size="lg" disabled={guardando}>{guardando ? "Creando…" : "Crear presupuesto"}</Button>
        </div>
      </div>
    </form>
  );
}
