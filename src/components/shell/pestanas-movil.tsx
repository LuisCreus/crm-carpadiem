"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_MOVIL, NAV_PRINCIPAL, estaActivo } from "./navegacion";

export function PestanasMovil() {
  const pathname = usePathname();
  const pestanas = NAV_MOVIL.map((href) => NAV_PRINCIPAL.find((i) => i.href === href)!);
  const enMas = !pestanas.some((p) => estaActivo(pathname, p.href));

  const clase = (activo: boolean) =>
    cn(
      "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] text-muted-foreground",
      activo && "font-semibold text-brand-text",
    );

  return (
    <nav
      aria-label="Pestañas"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card px-1 pt-1 pb-[max(env(safe-area-inset-bottom),8px)] md:hidden"
    >
      {pestanas.map((item) => {
        const Icono = item.icono;
        const activo = estaActivo(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} className={clase(activo)} aria-current={activo ? "page" : undefined}>
            <Icono className="size-[22px]" strokeWidth={1.8} aria-hidden />
            {item.titulo}
          </Link>
        );
      })}
      <Link href="/mas" className={clase(enMas)} aria-current={enMas ? "page" : undefined}>
        <Ellipsis className="size-[22px]" strokeWidth={1.8} aria-hidden />
        Más
      </Link>
    </nav>
  );
}
