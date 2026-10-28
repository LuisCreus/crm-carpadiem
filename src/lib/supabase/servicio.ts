import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente con la clave secreta de Supabase: salta los permisos (RLS).
// Solo para tareas automáticas del servidor, como la copia semanal.
export function crearClienteServicio() {
  const clave = process.env.SUPABASE_SECRET_KEY;
  if (!clave) throw new Error("Falta SUPABASE_SECRET_KEY en la configuración del servidor");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
