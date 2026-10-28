import { cn } from "@/lib/utils";
import { ESTADOS, type EstadoPresupuesto } from "@/lib/negocio";

export function EtiquetaEstado({ estado, className }: { estado: EstadoPresupuesto; className?: string }) {
  const e = ESTADOS[estado];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", e.clase, className)}>
      {e.texto}
    </span>
  );
}

export function Etiqueta({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", className)}>
      {children}
    </span>
  );
}

export const CLASE_CONFIRMADO = "bg-[#E8F4EC] text-[#25683D]";
export const CLASE_SEGURO = "bg-[#FDF3E1] text-[#8A5A0B]";
