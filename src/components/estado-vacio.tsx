import type { ReactNode } from "react";

export function EstadoVacio({ titulo, texto, children }: { titulo: string; texto?: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-6 py-14 text-center">
      <p className="font-medium">{titulo}</p>
      {texto && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{texto}</p>}
      {children && <div className="mt-5 flex justify-center gap-2">{children}</div>}
    </div>
  );
}
