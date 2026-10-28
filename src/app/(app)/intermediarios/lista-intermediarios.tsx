"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Mail, Pencil, Phone, Trash2 } from "lucide-react";
import { Cabecera } from "@/components/cabecera";
import { EstadoVacio } from "@/components/estado-vacio";
import { HistorialDialogo } from "@/components/historial-dialogo";
import { Campo, claseSelect } from "@/components/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { moverAPapelera } from "@/lib/datos/papelera";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { formatoPorcentaje } from "@/lib/formato";

type Intermediario = {
  id: string;
  nombre: string;
  tipo: string;
  comision_pct: number | null;
  contacto_nombre: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
};

type Borrador = Omit<Intermediario, "id"> & { id?: string };

const TIPOS: Record<string, string> = {
  wedding_planner: "Wedding planner",
  finca: "Finca",
  empresa: "Empresa",
  gilca_sound: "Gilca Sound",
  otro: "Otro",
};

const VACIO: Borrador = {
  nombre: "", tipo: "wedding_planner", comision_pct: null, contacto_nombre: "", telefono: "", email: "", notas: "",
};

export function ListaIntermediarios() {
  const { datos, cargando, error } = useTablaEnVivo<Intermediario>(["intermediarios"], async (supabase) => {
    const { data, error } = await supabase
      .from("intermediarios")
      .select("id, nombre, tipo, comision_pct, contacto_nombre, telefono, email, notas")
      .is("deleted_at", null)
      .order("nombre");
    if (error) throw new Error(error.message);
    return data as Intermediario[];
  });

  const [editando, setEditando] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    setGuardando(true);
    const { id, ...campos } = editando;
    const fila = { ...campos, nombre: campos.nombre.trim() };
    const supabase = crearClienteNavegador();
    const { error } = id
      ? await supabase.from("intermediarios").update(fila).eq("id", id)
      : await supabase.from("intermediarios").insert(fila);
    setGuardando(false);
    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    toast.success("Guardado ✓");
    setEditando(null);
  }

  async function borrar(item: Intermediario) {
    try {
      await moverAPapelera("intermediarios", item.id);
      toast.success(`"${item.nombre}" movido a la papelera`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo borrar");
    }
  }

  const nuevo = () => setEditando({ ...VACIO });

  return (
    <>
      <Cabecera titulo="Intermediarios" subtitulo="Wedding planners, fincas y otros que nos traen clientes">
        <Button onClick={nuevo}>+ Nuevo intermediario</Button>
      </Cabecera>

      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}

      {!cargando && datos.length === 0 && !error && (
        <EstadoVacio
          titulo="Todavía no hay intermediarios"
          texto="Apunta aquí las wedding planners y fincas que repiten. Cada uno tendrá su historial de presupuestos."
        >
          <Button onClick={nuevo}>+ Nuevo intermediario</Button>
        </EstadoVacio>
      )}

      {datos.length > 0 && (
        <ul className="divide-y rounded-xl border bg-card">
          {datos.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 md:px-5">
              <div className="min-w-0 flex-1 basis-60">
                <div className="font-medium">{item.nombre}</div>
                <div className="text-[13px] text-muted-foreground">
                  {TIPOS[item.tipo] ?? item.tipo}
                  {item.comision_pct !== null && ` · comisión ${formatoPorcentaje(item.comision_pct)}`}
                  {item.contacto_nombre && ` · ${item.contacto_nombre}`}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {item.telefono && (
                  <Button variant="ghost" size="icon" aria-label={`Llamar a ${item.nombre}`} render={<a href={`tel:${item.telefono}`} />}>
                    <Phone className="size-4" aria-hidden />
                  </Button>
                )}
                {item.email && (
                  <Button variant="ghost" size="icon" aria-label={`Escribir a ${item.nombre}`} render={<a href={`mailto:${item.email}`} />}>
                    <Mail className="size-4" aria-hidden />
                  </Button>
                )}
                <HistorialDialogo tabla="intermediarios" registroId={item.id} titulo={item.nombre} />
                <Button variant="ghost" size="icon" aria-label={`Editar ${item.nombre}`} onClick={() => setEditando({ ...item })}>
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Borrar ${item.nombre}`} onClick={() => borrar(item)}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editando !== null} onOpenChange={(abierto) => !abierto && setEditando(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar intermediario" : "Nuevo intermediario"}</DialogTitle>
          </DialogHeader>
          {editando && (
            <form id="form-intermediario" onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
              <Campo id="nombre" etiqueta="Nombre" className="sm:col-span-2">
                <Input id="nombre" required autoFocus value={editando.nombre}
                  onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
              </Campo>
              <Campo id="tipo" etiqueta="Tipo">
                <select id="tipo" className={claseSelect} value={editando.tipo}
                  onChange={(e) => setEditando({ ...editando, tipo: e.target.value })}>
                  {Object.entries(TIPOS).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
                </select>
              </Campo>
              <Campo id="comision" etiqueta="Comisión %">
                <Input id="comision" type="number" inputMode="decimal" min={0} max={100} step="0.5"
                  value={editando.comision_pct ?? ""}
                  onChange={(e) => setEditando({ ...editando, comision_pct: e.target.value === "" ? null : Number(e.target.value) })} />
              </Campo>
              <Campo id="contacto" etiqueta="Persona de contacto" className="sm:col-span-2">
                <Input id="contacto" value={editando.contacto_nombre ?? ""}
                  onChange={(e) => setEditando({ ...editando, contacto_nombre: e.target.value })} />
              </Campo>
              <Campo id="telefono" etiqueta="Teléfono">
                <Input id="telefono" type="tel" value={editando.telefono ?? ""}
                  onChange={(e) => setEditando({ ...editando, telefono: e.target.value })} />
              </Campo>
              <Campo id="email" etiqueta="Email">
                <Input id="email" type="email" value={editando.email ?? ""}
                  onChange={(e) => setEditando({ ...editando, email: e.target.value })} />
              </Campo>
              <Campo id="notas" etiqueta="Notas" className="sm:col-span-2">
                <Textarea id="notas" rows={3} value={editando.notas ?? ""}
                  onChange={(e) => setEditando({ ...editando, notas: e.target.value })} />
              </Campo>
            </form>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button type="submit" form="form-intermediario" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
