import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Usuario = {
  id: string;
  email: string;
  nombre: string;
  esAdmin: boolean;
};

// Usuario de la sesión actual, con su perfil. Si no hay sesión o el perfil
// está desactivado, manda a /login. Se calcula una vez por petición.
export const obtenerUsuario = cache(async (): Promise<Usuario> => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("id, email, nombre, rol, activo")
    .eq("id", userId)
    .maybeSingle();

  if (!perfil || !perfil.activo) redirect("/login?error=inactivo");

  return {
    id: perfil.id,
    email: perfil.email,
    nombre: perfil.nombre || perfil.email.split("@")[0],
    esAdmin: perfil.rol === "admin",
  };
});

export async function exigirAdmin(): Promise<Usuario> {
  const usuario = await obtenerUsuario();
  if (!usuario.esAdmin) redirect("/");
  return usuario;
}
