import type { ReactNode } from "react";

// Título de página + acción principal a la derecha
export function Cabecera({ titulo, subtitulo, children }: { titulo: string; subtitulo?: ReactNode; children?: ReactNode }) {
  return (
    // En el móvil: título arriba (dejando sitio a la lupa) y botones debajo, a lo ancho
    <div className="mb-6 flex flex-col gap-3 md:mb-7 md:flex-row md:flex-wrap md:items-end">
      <div className="min-w-0 flex-1 pr-12 md:pr-0">
        <h1 className="font-heading text-[32px] leading-tight md:text-[40px]">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-[15px] text-muted-foreground">{subtitulo}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2 *:flex-1 md:*:flex-none">{children}</div>}
    </div>
  );
}
