import type { ReactNode } from "react";

// Título de página + acción principal a la derecha
export function Cabecera({ titulo, subtitulo, children }: { titulo: string; subtitulo?: ReactNode; children?: ReactNode }) {
  return (
    // pr-12 en el móvil: deja sitio a la lupa flotante de arriba a la derecha
    <div className="mb-7 flex flex-wrap items-end gap-3 pr-12 md:pr-0">
      <div className="min-w-0 flex-1">
        <h1 className="font-heading text-[32px] leading-tight md:text-[40px]">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-[15px] text-muted-foreground">{subtitulo}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
