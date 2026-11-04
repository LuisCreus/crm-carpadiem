"use client";

import Link from "next/link";
import { useVeFinanzas } from "@/components/usuario";
import { cn } from "@/lib/utils";

const PESTANAS = [
  ["emitidas", "/facturas", "Emitidas"],
  ["recibidas", "/facturas/recibidas", "Recibidas (gastos)"],
  ["gestoria", "/facturas/gestoria", "Gestoría"],
  ["banco", "/facturas/banco", "Banco"],
] as const;

// Emitidas (a clientes) · Recibidas (de proveedores) · Gestoría (por trimestre) · Banco (conciliar)
export function PestanasFacturas({ activa }: { activa: (typeof PESTANAS)[number][0] }) {
  const veFinanzas = useVeFinanzas();
  // Gestoría y Banco: el administrador (y los socios, para ver)
  const visibles = PESTANAS.filter(([clave]) => veFinanzas || (clave !== "gestoria" && clave !== "banco"));
  return (
    <nav aria-label="Facturas" className="mb-5 inline-flex max-w-full overflow-x-auto rounded-lg border text-sm">
      {visibles.map(([clave, href, texto]) => (
        <Link key={clave} href={href} aria-current={activa === clave ? "page" : undefined}
          className={cn("px-3 py-1.5 whitespace-nowrap no-underline", activa === clave ? "bg-foreground text-background" : "bg-card text-foreground")}>
          {texto}
        </Link>
      ))}
    </nav>
  );
}
