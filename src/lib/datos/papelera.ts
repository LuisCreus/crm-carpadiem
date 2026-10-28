import { crearClienteNavegador } from "@/lib/supabase/client";

// "Borrar" para cualquier usuario: el registro va a la papelera
export async function moverAPapelera(tabla: string, id: string) {
  const { error } = await crearClienteNavegador().rpc("papelera_mover", { p_tabla: tabla, p_id: id });
  if (error) throw new Error(error.message);
}
