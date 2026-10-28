"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { NAV_PRINCIPAL, NAV_SECUNDARIA, estaActivo, type ItemNav } from "./navegacion";

function Enlace({ item, pathname }: { item: ItemNav; pathname: string }) {
  const activo = estaActivo(pathname, item.href);
  const Icono = item.icono;
  return (
    <Link
      href={item.href}
      aria-current={activo ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-muted hover:text-foreground",
        activo && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icono className="size-[18px]" strokeWidth={1.8} aria-hidden />
      {item.titulo}
    </Link>
  );
}

export function MenuLateral({ nombre, esAdmin }: { nombre: string; esAdmin: boolean }) {
  const pathname = usePathname();
  const iniciales = nombre.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <nav
      aria-label="Menú principal"
      className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r bg-sidebar px-3.5 py-5 md:flex"
    >
      <Link href="/" className="px-2.5 pb-5 text-[30px]" aria-label="Inicio">
        <Logo />
      </Link>
      {NAV_PRINCIPAL.map((item) => <Enlace key={item.href} item={item} pathname={pathname} />)}
      <div className="grow" />
      {NAV_SECUNDARIA.filter((i) => !i.soloAdmin || esAdmin).map((item) => (
        <Enlace key={item.href} item={item} pathname={pathname} />
      ))}
      <div className="mt-2 flex items-center gap-2.5 border-t px-2.5 pt-3">
        <div className="flex size-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-bold text-sidebar-accent-foreground">
          {iniciales}
        </div>
        <div className="min-w-0 flex-1 text-[13px] leading-tight">
          <div className="truncate">{nombre}</div>
          <div className="text-xs text-muted-foreground">{esAdmin ? "Administrador" : "Usuario"}</div>
        </div>
        <form action="/auth/salir" method="post">
          <button type="submit" aria-label="Cerrar sesión" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <LogOut className="size-4" aria-hidden />
          </button>
        </form>
      </div>
    </nav>
  );
}
