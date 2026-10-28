"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EstadoVacio } from "@/components/estado-vacio";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { formatoFechaHora } from "@/lib/formato";

type Elemento = {
  tabla: string;
  id: string;
  descripcion: string;
  deleted_at: string;
  deleted_by: string | null;
  borradoPor?: string;
};

const NOMBRE_TABLA: Record<string, string> = {
  clientes: "Cliente",
  contactos: "Contacto",
  intermediarios: "Intermediario",
  leads: "Lead",
  oportunidades: "Oportunidad",
  presupuestos: "Presupuesto",
  presupuesto_versiones: "Versión",
  cobros: "Cobro",
  eventos: "Evento",
  inventario: "Material",
  material_movimientos: "Movimiento de material",
};

const TABLAS = Object.keys(NOMBRE_TABLA);

export function ListaPapelera() {
  const { datos, cargando } = useTablaEnVivo<Elemento>(TABLAS, async (sb) => {
    const [{ data, error }, { data: perfiles }] = await Promise.all([
      sb.from("papelera").select("tabla, id, descripcion, deleted_at, deleted_by").order("deleted_at", { ascending: false }),
      sb.from("perfiles").select("id, email"),
    ]);
    if (error) throw new Error(error.message);
    const emails = new Map((perfiles ?? []).map((p) => [p.id as string, (p.email as string).split("@")[0]]));
    return (data as Elemento[]).map((e) => ({ ...e, borradoPor: e.deleted_by ? emails.get(e.deleted_by) : undefined }));
  });
  const [aEliminar, setAEliminar] = useState<Elemento | null>(null);

  async function llamar(funcion: "papelera_restaurar" | "papelera_eliminar", e: Elemento, ok: string) {
    const { error } = await crearClienteNavegador().rpc(funcion, { p_tabla: e.tabla, p_id: e.id });
    if (error) toast.error(error.message.includes("foreign key") ? "No se puede borrar: otros registros dependen de este." : error.message);
    else toast.success(ok);
  }

  if (!cargando && datos.length === 0) {
    return <EstadoVacio titulo="La papelera está vacía" texto="Cuando alguien borre algo, aparecerá aquí." />;
  }

  return (
    <>
      <ul className="divide-y rounded-xl border bg-card">
        {datos.map((e) => (
          <li key={`${e.tabla}:${e.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-5">
            <div className="min-w-0 flex-1 basis-60">
              <div className="font-medium">{e.descripcion}</div>
              <div className="text-[13px] text-muted-foreground">
                {NOMBRE_TABLA[e.tabla] ?? e.tabla} · borrado {formatoFechaHora(e.deleted_at)}
                {e.borradoPor && ` por ${e.borradoPor}`}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => llamar("papelera_restaurar", e, "Restaurado ✓")}>Restaurar</Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setAEliminar(e)}>
                Borrar para siempre
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <AlertDialog open={aEliminar !== null} onOpenChange={(abierto) => !abierto && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar para siempre?</AlertDialogTitle>
            <AlertDialogDescription>
              “{aEliminar?.descripcion}” se borrará definitivamente y no se podrá recuperar. El historial de cambios se conserva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (aEliminar) await llamar("papelera_eliminar", aEliminar, "Borrado definitivamente");
                setAEliminar(null);
              }}
            >
              Borrar para siempre
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
