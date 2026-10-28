import { NextResponse, type NextRequest } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

// Microsoft devuelve aquí al usuario tras iniciar sesión.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const descripcion = searchParams.get("error_description") ?? "";

  if (code) {
    const supabase = await crearClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
  }

  // El alta se cancela en la base de datos si el dominio no está permitido
  const motivo = /DOMINIO_NO_PERMITIDO|saving new user/i.test(descripcion) ? "dominio" : "login";
  return NextResponse.redirect(`${origin}/login?error=${motivo}`);
}
