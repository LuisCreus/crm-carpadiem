"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { crearClienteNavegador } from "@/lib/supabase/client";

// Datos que muchas partes de una pantalla necesitan a la vez (listas, proveedores, eventos…):
// se cargan una sola vez, con un solo canal de Realtime, y se comparten entre todos los que los usan.
// Se vuelven a cargar si alguien cambia esas tablas, al volver a la app (móvil) y al recuperar la conexión.

type Estado<T> = { datos: T | undefined; error: string | null };
type Entrada<T> = {
  estado: Estado<T>;
  oyentes: Set<() => void>;
  canal: RealtimeChannel | null;
  cargar: (sb: ReturnType<typeof crearClienteNavegador>) => Promise<T>;
  tablas: string[];
  turno: number;
  pendiente?: ReturnType<typeof setTimeout>;
};

const almacen = new Map<string, Entrada<unknown>>();

async function recargar(entrada: Entrada<unknown>) {
  const turno = ++entrada.turno;
  try {
    const datos = await entrada.cargar(crearClienteNavegador());
    if (turno !== entrada.turno) return; // llegó otra respuesta más nueva
    entrada.estado = { datos, error: null };
  } catch (e) {
    if (turno !== entrada.turno) return;
    entrada.estado = { ...entrada.estado, error: e instanceof Error ? e.message : "Error al cargar los datos" };
  }
  entrada.oyentes.forEach((o) => o());
}

// Al volver a la app o recuperar la conexión, todo lo que está en pantalla se recarga
if (typeof window !== "undefined") {
  const todo = () => almacen.forEach((e) => e.oyentes.size && void recargar(e));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) todo(); });
  window.addEventListener("online", todo);
}

export function useCompartido<T>(clave: string, tablas: string[], cargar: (sb: ReturnType<typeof crearClienteNavegador>) => Promise<T>) {
  const suscribir = useCallback((avisar: () => void) => {
    let entrada = almacen.get(clave) as Entrada<T> | undefined;
    if (!entrada) {
      entrada = { estado: { datos: undefined, error: null }, oyentes: new Set(), canal: null, cargar, tablas, turno: 0 };
      almacen.set(clave, entrada as Entrada<unknown>);
    }
    const e = entrada as Entrada<unknown>;
    e.oyentes.add(avisar);
    if (!e.canal) {
      const sb = crearClienteNavegador();
      const canal = sb.channel(`comp:${clave}:${Math.random().toString(36).slice(2)}`);
      for (const tabla of e.tablas) {
        canal.on("postgres_changes", { event: "*", schema: "public", table: tabla }, () => {
          clearTimeout(e.pendiente);
          e.pendiente = setTimeout(() => void recargar(e), 150);
        });
      }
      let primera = true;
      // Al (re)conectarse se recarga: lo que cambió mientras no había conexión no se pierde
      canal.subscribe((s) => { if (s === "SUBSCRIBED") { if (!primera) void recargar(e); primera = false; } });
      e.canal = canal;
      void recargar(e);
    }
    return () => {
      e.oyentes.delete(avisar);
      if (!e.oyentes.size && e.canal) {
        clearTimeout(e.pendiente);
        void crearClienteNavegador().removeChannel(e.canal);
        e.canal = null; // los datos se quedan en memoria: al volver a la pantalla se ven al instante
      }
    };
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps

  const leer = () => (almacen.get(clave)?.estado ?? VACIO) as Estado<T>;
  return useSyncExternalStore(suscribir, leer, () => VACIO as Estado<T>);
}

const VACIO: Estado<never> = { datos: undefined, error: null };
