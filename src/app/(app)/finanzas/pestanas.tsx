import Link from "next/link";
import { cn } from "@/lib/utils";

const PESTANAS = [
  ["pyg", "/finanzas", "P&L"],
  ["rentabilidad", "/finanzas/rentabilidad", "Rentabilidad por evento"],
] as const;

// P&L (todo el negocio, por fecha de factura) · Rentabilidad (margen de cada evento)
export function PestanasFinanzas({ activa }: { activa: (typeof PESTANAS)[number][0] }) {
  return (
    <nav aria-label="Finanzas" className="mb-5 inline-flex max-w-full overflow-x-auto rounded-lg border text-sm">
      {PESTANAS.map(([clave, href, texto]) => (
        <Link key={clave} href={href} aria-current={activa === clave ? "page" : undefined}
          className={cn("px-3 py-1.5 whitespace-nowrap no-underline", activa === clave ? "bg-foreground text-background" : "bg-card text-foreground")}>
          {texto}
        </Link>
      ))}
    </nav>
  );
}
