import { createBrowserClient } from "@supabase/ssr";

// Cliente de Supabase para el navegador (lecturas, cambios y tiempo real).
export function crearClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
