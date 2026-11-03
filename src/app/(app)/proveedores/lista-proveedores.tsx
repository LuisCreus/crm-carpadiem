"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Mail, Pencil, Phone, Trash2 } from "lucide-react";
import { Cabecera } from "@/components/cabecera";
import { EstadoVacio } from "@/components/estado-vacio";
import { HistorialDialogo } from "@/components/historial-dialogo";
import { Campo, claseSelect } from "@/components/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { nombreDe, useListas } from "@/hooks/use-listas";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { moverAPapelera } from "@/lib/datos/papelera";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { formatoIban, ibanValido } from "@/lib/leer-factura";

type Proveedor = {
  id: string;
  nombre: string;
  nif: string | null;
  iban: string | null;
  email: string | null;
  telefono: string | null;
  categoria: string | null;
  notas: string | null;
};
type Borrador = Omit<Proveedor, "id"> & { id?: string };
const VACIO: Borrador = { nombre: "", nif: "", iban: "", email: "", telefono: "", categoria: "", notas: "" };

// Proveedores: montadores, alquileres, gestoría… Con su NIF e IBAN, para apuntar sus facturas y pagarles
export function ListaProveedores() {
  const listas = useListas();
  const { datos, cargando, error } = useTablaEnVivo<Proveedor>(["proveedores"], async (sb) => {
    const { data, error } = await sb.from("proveedores").select("id, nombre, nif, iban, email, telefono, categoria, notas")
      .is("deleted_at", null).order("nombre");
    if (error) throw new Error(error.message);
    return data as Proveedor[];
  });
  const [buscar, setBuscar] = useState("");
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);

  const lista = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    return t ? datos.filter((p) => [p.nombre, p.nif, p.email].some((x) => x?.toLowerCase().includes(t))) : datos;
  }, [datos, buscar]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    const iban = editando.iban?.trim() ? formatoIban(editando.iban) : null;
    if (iban && !ibanValido(iban)) return toast.error("El IBAN no es correcto: revisa los números");
    setGuardando(true);
    const { id, ...campos } = editando;
    const fila = {
      nombre: campos.nombre.trim(),
      nif: campos.nif?.replace(/\s/g, "").toUpperCase() || null,
      iban,
      email: campos.email?.trim() || null,
      telefono: campos.telefono?.trim() || null,
      categoria: campos.categoria || null,
      notas: campos.notas?.trim() || null,
    };
    const sb = crearClienteNavegador();
    const { error } = id ? await sb.from("proveedores").update(fila).eq("id", id) : await sb.from("proveedores").insert(fila);
    setGuardando(false);
    if (error) return toast.error(`No se pudo guardar: ${error.message}`);
    toast.success("Guardado ✓");
    setEditando(null);
  }

  async function borrar(p: Proveedor) {
    if (!window.confirm(`¿Mover a ${p.nombre} a la papelera? Sus facturas no se borran.`)) return;
    try {
      await moverAPapelera("proveedores", p.id);
      toast.success(`${p.nombre} movido a la papelera`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo borrar");
    }
  }

  const nuevo = () => setEditando({ ...VACIO });

  return (
    <>
      <Cabecera titulo="Proveedores" subtitulo="Montadores, alquileres, gestoría… con su NIF e IBAN para sus facturas y pagos">
        <Button onClick={nuevo}>+ Nuevo proveedor</Button>
      </Cabecera>

      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
      {datos.length > 5 && (
        <Input className="mb-4 max-w-sm" placeholder="Buscar por nombre, NIF o email" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      )}

      {!cargando && datos.length === 0 && !error && (
        <EstadoVacio titulo="Todavía no hay proveedores"
          texto="Apunta aquí a tus montadores y proveedores con su NIF e IBAN: al registrar una factura suya se rellenarán solos.">
          <Button onClick={nuevo}>+ Nuevo proveedor</Button>
        </EstadoVacio>
      )}

      {lista.length > 0 && (
        <ul className="divide-y rounded-xl border bg-card">
          {lista.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 md:px-5">
              <div className="min-w-0 flex-1 basis-60">
                <div className="font-medium">{p.nombre}</div>
                <div className="text-[13px] text-muted-foreground">
                  {[p.nif, p.iban, p.categoria && nombreDe(listas.categoriasGasto, p.categoria)].filter(Boolean).join(" · ") || "Sin NIF ni IBAN"}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {p.telefono && (
                  <Button variant="ghost" size="icon" aria-label={`Llamar a ${p.nombre}`} render={<a href={`tel:${p.telefono}`} />}>
                    <Phone className="size-4" aria-hidden />
                  </Button>
                )}
                {p.email && (
                  <Button variant="ghost" size="icon" aria-label={`Escribir a ${p.nombre}`} render={<a href={`mailto:${p.email}`} />}>
                    <Mail className="size-4" aria-hidden />
                  </Button>
                )}
                <HistorialDialogo tabla="proveedores" registroId={p.id} titulo={p.nombre} />
                <Button variant="ghost" size="icon" aria-label={`Editar ${p.nombre}`} onClick={() => setEditando({ ...p })}>
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Borrar ${p.nombre}`} onClick={() => borrar(p)}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editando !== null} onOpenChange={(a) => !a && setEditando(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
            <DialogDescription>Al apuntar una factura suya, el NIF y el IBAN se rellenan solos.</DialogDescription>
          </DialogHeader>
          {editando && (
            <form id="form-proveedor" onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
              <Campo id="pv-nombre" etiqueta="Nombre" className="sm:col-span-2">
                <Input id="pv-nombre" required autoFocus value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
              </Campo>
              <Campo id="pv-nif" etiqueta="NIF / CIF">
                <Input id="pv-nif" value={editando.nif ?? ""} onChange={(e) => setEditando({ ...editando, nif: e.target.value })} />
              </Campo>
              <Campo id="pv-categoria" etiqueta="Categoría habitual">
                <select id="pv-categoria" className={claseSelect} value={editando.categoria ?? ""} onChange={(e) => setEditando({ ...editando, categoria: e.target.value })}>
                  <option value="">—</option>
                  {listas.categoriasGasto.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
                </select>
              </Campo>
              <Campo id="pv-iban" etiqueta="IBAN" className="sm:col-span-2">
                <Input id="pv-iban" value={editando.iban ?? ""} placeholder="ES00 0000 0000 0000 0000 0000" onChange={(e) => setEditando({ ...editando, iban: e.target.value })} />
              </Campo>
              <Campo id="pv-tel" etiqueta="Teléfono">
                <Input id="pv-tel" type="tel" value={editando.telefono ?? ""} onChange={(e) => setEditando({ ...editando, telefono: e.target.value })} />
              </Campo>
              <Campo id="pv-email" etiqueta="Email">
                <Input id="pv-email" type="email" value={editando.email ?? ""} onChange={(e) => setEditando({ ...editando, email: e.target.value })} />
              </Campo>
              <Campo id="pv-notas" etiqueta="Notas" className="sm:col-span-2">
                <Textarea id="pv-notas" rows={2} value={editando.notas ?? ""} onChange={(e) => setEditando({ ...editando, notas: e.target.value })} />
              </Campo>
            </form>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button type="submit" form="form-proveedor" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
