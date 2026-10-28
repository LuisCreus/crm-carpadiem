import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// /api/copias/semanal la llama Vercel sin sesión: se protege con CRON_SECRET
const RUTAS_PUBLICAS = ["/login", "/auth", "/api/copias/semanal"];

// Refresca la sesión en cada petición y manda a /login a quien no la tenga.
export async function actualizarSesion(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [clave, valor] of Object.entries(headers ?? {})) {
            response.headers.set(clave, valor);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const esPublica = RUTAS_PUBLICAS.some((r) => request.nextUrl.pathname.startsWith(r));

  if (!data?.claims && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
