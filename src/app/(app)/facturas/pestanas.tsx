import Link from "next/link";
import { cn } from "@/lib/utils";

// Emitidas (a clientes) · Recibidas (de proveedores)
export function PestanasFacturas({ activa }: { activa: "emitidas" | "recibidas" }) {
  return (
    <nav aria-label="Tipo de facturas" className="mb-5 inline-flex overflow-hidden rounded-lg border text-sm">
      {([["emitidas", "/facturas", "Emitidas"], ["recibidas", "/facturas/recibidas", "Recibidas (gastos)"]] as const).map(([clave, href, texto]) => (
        <Link key={clave} href={href} aria-current={activa === clave ? "page" : undefined}
          className={cn("px-3 py-1.5 no-underline", activa === clave ? "bg-foreground text-background" : "bg-card text-foreground")}>
          {texto}
        </Link>
      ))}
    </nav>
  );
}
