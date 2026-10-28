import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Campo({ id, etiqueta, children, className }: { id: string; etiqueta: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
    </div>
  );
}

// <select> nativo: en el móvil abre el selector del propio teléfono
export const claseSelect =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
