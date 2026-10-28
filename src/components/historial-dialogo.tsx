"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { formatoFechaHora } from "@/lib/formato";
import { NOMBRES_ACCION, NOMBRES_CAMPO, valorLegible } from "@/lib/historial";

type Entrada = {
  id: number;
  accion: string;
  usuario_email: string | null;
  fecha: string;
  cambios: Record<string, { antes: unknown; despues: unknown }> | null;
};

const OCULTOS = new Set(["deleted_by", "id"]);

export function HistorialDialogo({ tabla, registroId, titulo }: { tabla: string; registroId: string; titulo: string }) {
  const [abierto, setAbierto] = useState(false);
  const [entradas, setEntradas] = useState<Entrada[] | null>(null);

  useEffect(() => {
    if (!abierto) return;
    const supabase = crearClienteNavegador();
    supabase
      .from("historial")
      .select("id, accion, usuario_email, fecha, cambios")
      .eq("tabla", tabla)
      .eq("registro_id", registroId)
      .order("fecha", { ascending: false })
      .then(({ data }) => setEntradas((data as Entrada[]) ?? []));
  }, [abierto, tabla, registroId]);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button variant="ghost" size="icon" aria-label={`Historial de ${titulo}`} />}>
        <History className="size-4" aria-hidden />
      </DialogTrigger>
      <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Historial · {titulo}</DialogTitle>
        </DialogHeader>
        {entradas === null && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {entradas?.length === 0 && <p className="text-sm text-muted-foreground">Sin cambios registrados.</p>}
        <ol className="space-y-4">
          {entradas?.map((e) => (
            <li key={e.id} className="text-sm">
              <div>
                <span className="font-semibold">{e.usuario_email?.split("@")[0] ?? "Sistema"}</span>{" "}
                {NOMBRES_ACCION[e.accion] ?? e.accion}
                <span className="ml-2 text-xs text-muted-foreground">{formatoFechaHora(e.fecha)}</span>
              </div>
              {e.accion === "editar" && e.cambios && (
                <ul className="mt-1 space-y-0.5 text-[13px] text-muted-foreground">
                  {Object.entries(e.cambios)
                    .filter(([campo]) => !OCULTOS.has(campo))
                    .map(([campo, c]) => (
                      <li key={campo}>
                        {NOMBRES_CAMPO[campo] ?? campo}: {valorLegible(c.antes)} → <span className="text-foreground">{valorLegible(c.despues)}</span>
                      </li>
                    ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
