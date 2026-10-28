import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { Cabecera } from "@/components/cabecera";
import { NAV_MOVIL, NAV_PRINCIPAL, NAV_SECUNDARIA } from "@/components/shell/navegacion";
import { obtenerUsuario } from "@/lib/auth";

// Pestaña "Más" del móvil: todo lo que no cabe en las pestañas de abajo
export default async function MasPage() {
  const usuario = await obtenerUsuario();
  const items = [
    ...NAV_PRINCIPAL.filter((i) => !NAV_MOVIL.includes(i.href)),
    ...NAV_SECUNDARIA.filter((i) => !i.soloAdmin || usuario.esAdmin),
  ];

  return (
    <>
      <Cabecera titulo="Más" subtitulo={usuario.email} />
      <ul className="divide-y rounded-xl border bg-card">
        {items.map((item) => {
          const Icono = item.icono;
          return (
            <li key={item.href}>
              <Link href={item.href} className="flex min-h-12 items-center gap-3 px-4 text-[15px]">
                <Icono className="size-5 text-muted-foreground" strokeWidth={1.8} aria-hidden />
                <span className="flex-1">{item.titulo}</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          );
        })}
        <li>
          <form action="/auth/salir" method="post">
            <button type="submit" className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px] text-destructive">
              <LogOut className="size-5" strokeWidth={1.8} aria-hidden />
              Cerrar sesión
            </button>
          </form>
        </li>
      </ul>
    </>
  );
}
