import { obtenerUsuario } from "@/lib/auth";
import { MenuLateral } from "@/components/shell/menu-lateral";
import { PestanasMovil } from "@/components/shell/pestanas-movil";
import { BusquedaGlobal } from "@/components/busqueda-global";
import { BotonBuscarMovil } from "@/components/shell/boton-buscar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const usuario = await obtenerUsuario();

  return (
    <div className="flex min-h-dvh">
      <MenuLateral nombre={usuario.nombre} esAdmin={usuario.esAdmin} />
      <main className="min-w-0 flex-1 px-4 pt-5 pb-28 md:px-10 md:pt-6 md:pb-12">{children}</main>
      <PestanasMovil />
      <BotonBuscarMovil />
      <BusquedaGlobal />
    </div>
  );
}
