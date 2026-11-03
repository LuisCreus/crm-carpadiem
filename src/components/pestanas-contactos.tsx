import Link from "next/link";
import { cn } from "@/lib/utils";

// Contactos: Proveedores (a quienes pagamos) · Intermediarios (quienes nos traen clientes)
export function PestanasContactos({ activa }: { activa: "proveedores" | "intermediarios" }) {
  return (
    <nav aria-label="Tipo de contacto" className="mb-5 inline-flex overflow-hidden rounded-lg border text-sm">
      {([["proveedores", "/proveedores", "Proveedores"], ["intermediarios", "/intermediarios", "Intermediarios"]] as const).map(([clave, href, texto]) => (
        <Link key={clave} href={href} aria-current={activa === clave ? "page" : undefined}
          className={cn("px-3 py-1.5 no-underline", activa === clave ? "bg-foreground text-background" : "bg-card text-foreground")}>
          {texto}
        </Link>
      ))}
    </nav>
  );
}
