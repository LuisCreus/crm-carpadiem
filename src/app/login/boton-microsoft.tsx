"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { crearClienteNavegador } from "@/lib/supabase/client";

export function BotonMicrosoft() {
  const [cargando, setCargando] = useState(false);

  async function entrar() {
    setCargando(true);
    const supabase = crearClienteNavegador();
    await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email profile",
        redirectTo: `${window.location.origin}/auth/callback`,
        // Pedir siempre usuario y contraseña de Microsoft, en vez de entrar
        // con la cuenta que ya esté abierta en el navegador
        queryParams: { prompt: "login" },
      },
    });
  }

  return (
    <Button size="lg" className="w-full h-11" onClick={entrar} disabled={cargando}>
      <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#F25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
        <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
        <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
      </svg>
      {cargando ? "Conectando…" : "Entrar con Microsoft"}
    </Button>
  );
}
