import type { ReactNode } from "react";

// Título de página + acción principal a la derecha
export function Cabecera({ titulo, subtitulo, children }: { titulo: string; subtitulo?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="font-heading text-[32px] leading-tight md:text-[40px]">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-[15px] text-muted-foreground">{subtitulo}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
