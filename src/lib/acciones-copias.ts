"use server";

import { exigirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hacerCopia, type ResultadoCopia } from "@/lib/copias-servidor";
import { rutaCopias } from "@/lib/graph/sharepoint";

// "Exportar ahora" (solo administrador): guarda la copia en SharePoint
export async function exportarAhora(): Promise<({ ok: true } & ResultadoCopia) | { ok: false; error: string }> {
  try {
    await exigirAdmin();
    return { ok: true, ...(await hacerCopia(await crearClienteServidor())) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export async function carpetaCopias(): Promise<string> {
  await exigirAdmin();
  return rutaCopias();
}
