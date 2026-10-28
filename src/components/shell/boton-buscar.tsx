"use client";

import { Search } from "lucide-react";
import { abrirBusqueda } from "@/components/busqueda-global";

// Lupa flotante arriba a la derecha, solo en el móvil
export function BotonBuscarMovil() {
  return (
    <button
      type="button"
      aria-label="Buscar"
      onClick={abrirBusqueda}
      className="fixed top-3 right-3 z-30 flex size-11 items-center justify-center rounded-full border bg-card/95 text-foreground backdrop-blur md:hidden"
    >
      <Search className="size-5" aria-hidden />
    </button>
  );
}
