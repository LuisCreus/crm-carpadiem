"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";

// Carga datos y los vuelve a cargar en cuanto alguien cambia algo en
// cualquiera de las tablas indicadas (Supabase Realtime).
export function useTablaEnVivo<T>(
  tablas: string[],
  cargar: (supabase: ReturnType<typeof crearClienteNavegador>) => Promise<T[]>,
) {
  const [datos, setDatos] = useState<T[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Siempre la última versión de "cargar", sin volver a suscribirse
  const cargarRef = useRef(cargar);
  useLayoutEffect(() => {
    cargarRef.current = cargar;
  });
  const clave = tablas.join(",");

  const recargar = useCallback(async () => {
    const supabase = crearClienteNavegador();
    try {
      setDatos(await cargarRef.current(supabase));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar los datos");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const supabase = crearClienteNavegador();
    void recargar();

    let pendiente: ReturnType<typeof setTimeout> | undefined;
    const canal = supabase.channel(`vivo:${clave}:${Math.random().toString(36).slice(2)}`);
    for (const tabla of clave.split(",")) {
      canal.on("postgres_changes", { event: "*", schema: "public", table: tabla }, () => {
        // Agrupa ráfagas de cambios en una sola recarga
        clearTimeout(pendiente);
        pendiente = setTimeout(() => void recargar(), 150);
      });
    }
    canal.subscribe();

    return () => {
      clearTimeout(pendiente);
      void supabase.removeChannel(canal);
    };
  }, [clave, recargar]);

  return { datos, cargando, error, recargar };
}
