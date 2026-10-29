"use client";

import { useMemo, useState, type DragEvent, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FilePlus2, Mail, Phone, Search, Trash2 } from "lucide-react";
import { Cabecera } from "@/components/cabecera";
import { Campo, claseSelect } from "@/components/campo";
import { EstadoVacio } from "@/components/estado-vacio";
import { HistorialDialogo } from "@/components/historial-dialogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { nombreDe, useListas } from "@/hooks/use-listas";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { moverAPapelera } from "@/lib/datos/papelera";
import { uno } from "@/lib/datos/tipos";
import { formatoFecha, hoyMadrid } from "@/lib/formato";
import { cn } from "@/lib/utils";

type EstadoLead = "por_contactar" | "contactado" | "interesado" | "presupuesto_enviado" | "ganado" | "perdido";

const ESTADOS_LEAD: { valor: EstadoLead; texto: string; clase: string }[] = [
  { valor: "por_contactar", texto: "Por contactar", clase: "bg-[#F2F1EE] text-[#4B4B48]" },
  { valor: "contactado", texto: "Contactado", clase: "bg-[#EEF4F7] text-[#2F5D70]" },
  { valor: "interesado", texto: "Interesado", clase: "bg-[#FDF3E1] text-[#8A5A0B]" },
  { valor: "presupuesto_enviado", texto: "Presupuesto enviado", clase: "bg-[#FDEDEC] text-[#B0302A]" },
  { valor: "ganado", texto: "Ganado", clase: "bg-[#E8F4EC] text-[#25683D]" },
  { valor: "perdido", texto: "Perdido", clase: "bg-[#F2F1EE] text-[#6B6A66]" },
];
const ESTADO = Object.fromEntries(ESTADOS_LEAD.map((e) => [e.valor, e])) as Record<EstadoLead, (typeof ESTADOS_LEAD)[number]>;

type Lead = {
  id: string;
  comercial_id: string | null;
  fecha_primer_contacto: string;
  cliente_nombre: string;
  contacto_nombre: string | null;
  telefono: string | null;
  email: string | null;
  tipo_cliente: string | null;
  canal: string | null;
  fecha_evento_aprox: string | null;
  lugar_aprox: string | null;
  que_pide: string | null;
  proxima_accion_fecha: string | null;
  proxima_accion_texto: string | null;
  comentarios: string | null;
  estado: EstadoLead;
  orden_kanban: number;
  comercial: { nombre: string } | null;
};

type Borrador = Omit<Lead, "id" | "orden_kanban" | "comercial"> & { id?: string };

const hoy = () => hoyMadrid();

export function TableroLeads({ nombreUsuario }: { nombreUsuario: string }) {
  const listas = useListas();
  const { datos, cargando } = useTablaEnVivo<Lead>(["leads"], async (sb) => {
    const { data, error } = await sb.from("leads").select("*, comercial:comerciales(nombre)")
      .is("deleted_at", null).order("orden_kanban").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((l) => ({ ...l, comercial: uno(l.comercial) })) as Lead[];
  });

  const [vista, setVista] = useState<"kanban" | "tabla">("kanban");
  const [texto, setTexto] = useState("");
  const [filtroComercial, setFiltroComercial] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  // /leads?nuevo=1 abre directamente el alta rápida (botón "+ Lead rápido" del Inicio)
  const abrirNuevo = useSearchParams().get("nuevo") === "1";
  const [editando, setEditando] = useState<Borrador | null>(() => (abrirNuevo ? {
    comercial_id: null, fecha_primer_contacto: hoy(), cliente_nombre: "", contacto_nombre: "", telefono: "", email: "",
    tipo_cliente: "particular", canal: "email", fecha_evento_aprox: "", lugar_aprox: "", que_pide: "",
    proxima_accion_fecha: null, proxima_accion_texto: "", comentarios: "", estado: "por_contactar",
  } : null));
  const [arrastrando, setArrastrando] = useState<string | null>(null);

  const comercialPropio = listas.comerciales.find((c) => c.nombre.toLowerCase() === nombreUsuario.split(" ")[0].toLowerCase());

  const nuevo = (): Borrador => ({
    comercial_id: comercialPropio?.id ?? null, fecha_primer_contacto: hoy(), cliente_nombre: "", contacto_nombre: "",
    telefono: "", email: "", tipo_cliente: "particular", canal: "email", fecha_evento_aprox: "", lugar_aprox: "",
    que_pide: "", proxima_accion_fecha: null, proxima_accion_texto: "", comentarios: "", estado: "por_contactar",
  });

  const filtrados = useMemo(() => {
    const t = texto.toLowerCase();
    return datos.filter((l) =>
      (!filtroComercial || l.comercial_id === filtroComercial) &&
      (!filtroEstado || l.estado === filtroEstado) &&
      (!t || [l.cliente_nombre, l.contacto_nombre, l.lugar_aprox, l.que_pide, l.telefono, l.email].join(" ").toLowerCase().includes(t)));
  }, [datos, texto, filtroComercial, filtroEstado]);

  const sb = crearClienteNavegador();

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    const { id, ...campos } = editando;
    const fila = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v === "" ? null : v]));
    fila.cliente_nombre = editando.cliente_nombre.trim();
    const { error } = id ? await sb.from("leads").update(fila).eq("id", id) : await sb.from("leads").insert(fila);
    if (error) return toast.error(error.message);
    toast.success(id ? "Guardado ✓" : "Lead apuntado ✓");
    setEditando(null);
  }

  async function moverA(lead: Lead, estado: EstadoLead) {
    if (lead.estado === estado) return;
    const { error } = await sb.from("leads").update({ estado }).eq("id", lead.id);
    if (error) toast.error(error.message);
  }

  async function borrar(lead: Borrador & { id: string }) {
    if (!window.confirm(`¿Mover el lead de ${lead.cliente_nombre} a la papelera?`)) return;
    await moverAPapelera("leads", lead.id);
    toast.success("Lead movido a la papelera");
    setEditando(null);
  }

  const soltar = (estado: EstadoLead) => (e: DragEvent) => {
    e.preventDefault();
    const lead = datos.find((l) => l.id === arrastrando);
    if (lead) void moverA(lead, estado);
    setArrastrando(null);
  };

  const accionVencida = (l: Lead) => l.proxima_accion_fecha && l.proxima_accion_fecha <= hoy() && !["ganado", "perdido"].includes(l.estado);

  return (
    <>
      <Cabecera titulo="Leads" subtitulo={`${datos.filter((l) => !["ganado", "perdido"].includes(l.estado)).length} abiertos`}>
        <Button onClick={() => setEditando(nuevo())}>+ Lead rápido</Button>
      </Cabecera>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Vista" className="inline-flex overflow-hidden rounded-lg border text-sm">
          {(["kanban", "tabla"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)}
              className={cn("px-3 py-1.5", vista === v ? "bg-foreground text-background" : "bg-card")}>
              {v === "kanban" ? "Kanban" : "Tabla"}
            </button>
          ))}
        </div>
        <label className="flex h-9 min-w-0 flex-[1_1_220px] items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input type="search" aria-label="Buscar leads" placeholder="Buscar…" className="min-w-0 flex-1 bg-transparent outline-none"
            value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
        <select aria-label="Comercial" className={`${claseSelect} h-9 w-40 bg-card`} value={filtroComercial} onChange={(e) => setFiltroComercial(e.target.value)}>
          <option value="">Todos los comerciales</option>
          {listas.comerciales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {vista === "tabla" && (
          <select aria-label="Estado" className={`${claseSelect} h-9 w-44 bg-card`} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {ESTADOS_LEAD.map((e) => <option key={e.valor} value={e.valor}>{e.texto}</option>)}
          </select>
        )}
      </div>

      {!cargando && datos.length === 0 && (
        <EstadoVacio titulo="Todavía no hay leads" texto="Apunta cada contacto nuevo en menos de 30 segundos, también desde el móvil.">
          <Button onClick={() => setEditando(nuevo())}>+ Lead rápido</Button>
        </EstadoVacio>
      )}

      {datos.length > 0 && vista === "kanban" && (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
          {ESTADOS_LEAD.map((col) => {
            const tarjetas = filtrados.filter((l) => l.estado === col.valor);
            return (
              <section key={col.valor} aria-label={col.texto}
                onDragOver={(e) => e.preventDefault()} onDrop={soltar(col.valor)}
                className={cn("flex w-[78vw] max-w-72 shrink-0 snap-start flex-col gap-2 rounded-xl bg-muted/60 p-2.5 md:w-64", arrastrando && "outline-1 outline-dashed outline-border")}>
                <div className="flex items-center gap-2 px-1 py-1">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", col.clase)}>{col.texto}</span>
                  <span className="text-xs text-muted-foreground">{tarjetas.length}</span>
                </div>
                {tarjetas.map((l) => (
                  <article key={l.id} draggable onDragStart={() => setArrastrando(l.id)} onDragEnd={() => setArrastrando(null)}
                    className={cn("cursor-grab rounded-lg border bg-card p-3 active:cursor-grabbing", arrastrando === l.id && "opacity-50")}>
                    <button type="button" className="block w-full text-left" onClick={() => setEditando({ ...l })}>
                      <div className="text-sm font-medium">{l.cliente_nombre}</div>
                      {l.que_pide && <div className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{l.que_pide}</div>}
                      <div className="mt-1.5 text-xs text-muted-foreground">
                        {[l.fecha_evento_aprox, l.lugar_aprox].filter(Boolean).join(" · ")}
                      </div>
                      {l.proxima_accion_fecha && (
                        <div className={cn("mt-1.5 text-xs", accionVencida(l) ? "font-medium text-[#B0302A]" : "text-muted-foreground")}>
                          {formatoFecha(l.proxima_accion_fecha)} · {l.proxima_accion_texto || "Próxima acción"}
                        </div>
                      )}
                    </button>
                    <div className="mt-2 flex items-center gap-1 border-t pt-2">
                      <span className="flex-1 text-xs text-muted-foreground">{l.comercial?.nombre}</span>
                      {l.telefono && <Button variant="ghost" size="icon-sm" aria-label={`Llamar a ${l.cliente_nombre}`} render={<a href={`tel:${l.telefono}`} />}><Phone className="size-3.5" aria-hidden /></Button>}
                      {l.email && <Button variant="ghost" size="icon-sm" aria-label={`Email a ${l.cliente_nombre}`} render={<a href={`mailto:${l.email}`} />}><Mail className="size-3.5" aria-hidden /></Button>}
                      {/* En el móvil no se puede arrastrar: se cambia el estado aquí */}
                      <select aria-label="Mover a" className="h-7 max-w-24 rounded-md border bg-background px-1 text-xs md:hidden" value={l.estado}
                        onChange={(e) => moverA(l, e.target.value as EstadoLead)}>
                        {ESTADOS_LEAD.map((e) => <option key={e.valor} value={e.valor}>{e.texto}</option>)}
                      </select>
                    </div>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}

      {datos.length > 0 && vista === "tabla" && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-3 py-2.5 font-medium">Qué pide</th>
                <th className="px-3 py-2.5 font-medium">Evento</th>
                <th className="px-3 py-2.5 font-medium">Canal</th>
                <th className="px-3 py-2.5 font-medium">Próxima acción</th>
                <th className="px-3 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 font-medium">Comercial</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((l) => (
                <tr key={l.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => setEditando({ ...l })}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{l.cliente_nombre}</div>
                    <div className="text-xs text-muted-foreground">Desde {formatoFecha(l.fecha_primer_contacto)}</div>
                  </td>
                  <td className="max-w-56 truncate px-3 py-2.5">{l.que_pide}</td>
                  <td className="px-3 py-2.5">{[l.fecha_evento_aprox, l.lugar_aprox].filter(Boolean).join(" · ")}</td>
                  <td className="px-3 py-2.5">{nombreDe(listas.canales, l.canal)}</td>
                  <td className={cn("px-3 py-2.5", accionVencida(l) && "text-[#B0302A]")}>
                    {l.proxima_accion_fecha && `${formatoFecha(l.proxima_accion_fecha)} · `}{l.proxima_accion_texto}
                  </td>
                  <td className="px-3 py-2.5"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", ESTADO[l.estado].clase)}>{ESTADO[l.estado].texto}</span></td>
                  <td className="px-4 py-2.5 text-muted-foreground">{l.comercial?.nombre}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editando !== null} onOpenChange={(a) => !a && setEditando(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editando?.id ? editando.cliente_nombre : "Lead rápido"}</DialogTitle>
          </DialogHeader>
          {editando && (
            <form id="form-lead" onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
              <Campo id="l-cliente" etiqueta="Cliente" className="sm:col-span-2">
                <Input id="l-cliente" required autoFocus={!editando.id} value={editando.cliente_nombre}
                  onChange={(e) => setEditando({ ...editando, cliente_nombre: e.target.value })} />
              </Campo>
              <Campo id="l-tel" etiqueta="Teléfono">
                <Input id="l-tel" type="tel" value={editando.telefono ?? ""} onChange={(e) => setEditando({ ...editando, telefono: e.target.value })} />
              </Campo>
              <Campo id="l-email" etiqueta="Email">
                <Input id="l-email" type="email" value={editando.email ?? ""} onChange={(e) => setEditando({ ...editando, email: e.target.value })} />
              </Campo>
              <Campo id="l-que" etiqueta="Qué pide" className="sm:col-span-2">
                <Input id="l-que" placeholder="Beduina 12x9 para 120 personas" value={editando.que_pide ?? ""} onChange={(e) => setEditando({ ...editando, que_pide: e.target.value })} />
              </Campo>
              <Campo id="l-fecha-ev" etiqueta="Fecha aproximada del evento">
                <Input id="l-fecha-ev" placeholder="junio 2027" value={editando.fecha_evento_aprox ?? ""} onChange={(e) => setEditando({ ...editando, fecha_evento_aprox: e.target.value })} />
              </Campo>
              <Campo id="l-lugar" etiqueta="Lugar aproximado">
                <Input id="l-lugar" value={editando.lugar_aprox ?? ""} onChange={(e) => setEditando({ ...editando, lugar_aprox: e.target.value })} />
              </Campo>
              <Campo id="l-canal" etiqueta="Canal">
                <select id="l-canal" className={claseSelect} value={editando.canal ?? ""} onChange={(e) => setEditando({ ...editando, canal: e.target.value })}>
                  {listas.canales.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
                </select>
              </Campo>
              <Campo id="l-tipo" etiqueta="Tipo de cliente">
                <select id="l-tipo" className={claseSelect} value={editando.tipo_cliente ?? ""} onChange={(e) => setEditando({ ...editando, tipo_cliente: e.target.value })}>
                  {listas.tiposCliente.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
                </select>
              </Campo>
              <Campo id="l-accion-fecha" etiqueta="Próxima acción · fecha">
                <Input id="l-accion-fecha" type="date" value={editando.proxima_accion_fecha ?? ""} onChange={(e) => setEditando({ ...editando, proxima_accion_fecha: e.target.value || null })} />
              </Campo>
              <Campo id="l-accion" etiqueta="Próxima acción">
                <Input id="l-accion" placeholder="Llamar para cerrar visita" value={editando.proxima_accion_texto ?? ""} onChange={(e) => setEditando({ ...editando, proxima_accion_texto: e.target.value })} />
              </Campo>
              <details className="sm:col-span-2" open={!!editando.id}>
                <summary className="cursor-pointer text-sm text-muted-foreground">Más datos</summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Campo id="l-contacto" etiqueta="Persona de contacto">
                    <Input id="l-contacto" value={editando.contacto_nombre ?? ""} onChange={(e) => setEditando({ ...editando, contacto_nombre: e.target.value })} />
                  </Campo>
                  <Campo id="l-comercial" etiqueta="Comercial">
                    <select id="l-comercial" className={claseSelect} value={editando.comercial_id ?? ""} onChange={(e) => setEditando({ ...editando, comercial_id: e.target.value || null })}>
                      <option value="">—</option>
                      {listas.comerciales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </Campo>
                  <Campo id="l-primer" etiqueta="Primer contacto">
                    <Input id="l-primer" type="date" value={editando.fecha_primer_contacto} onChange={(e) => setEditando({ ...editando, fecha_primer_contacto: e.target.value })} />
                  </Campo>
                  <Campo id="l-estado" etiqueta="Estado">
                    <select id="l-estado" className={claseSelect} value={editando.estado} onChange={(e) => setEditando({ ...editando, estado: e.target.value as EstadoLead })}>
                      {ESTADOS_LEAD.map((e) => <option key={e.valor} value={e.valor}>{e.texto}</option>)}
                    </select>
                  </Campo>
                  <Campo id="l-com" etiqueta="Comentarios" className="sm:col-span-2">
                    <Textarea id="l-com" rows={3} value={editando.comentarios ?? ""} onChange={(e) => setEditando({ ...editando, comentarios: e.target.value })} />
                  </Campo>
                </div>
              </details>
            </form>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {editando?.id && (
              <>
                <Button variant="ghost" size="icon" aria-label="Mover a la papelera" onClick={() => borrar(editando as Borrador & { id: string })}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
                <HistorialDialogo tabla="leads" registroId={editando.id} titulo={editando.cliente_nombre} />
                <Button variant="outline" className="sm:mr-auto" render={<Link href={`/presupuestos/nuevo?lead=${editando.id}`} />}>
                  <FilePlus2 className="size-4" aria-hidden /> Crear presupuesto
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button type="submit" form="form-lead">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
