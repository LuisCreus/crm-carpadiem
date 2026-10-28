import type { NextRequest } from "next/server";
import { actualizarSesion } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return actualizarSesion(request);
}

export const config = {
  // Todo salvo archivos estáticos, iconos y el manifiesto de la PWA
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|.*\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
