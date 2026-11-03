"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";

// Carga datos y los vuelve a cargar en cuanto alguien cambia algo en
// cualquiera de las tablas indicadas (Supabase Realtime), al volver a la app
// (el móvil se bloquea y pierde la conexión) y al recuperar la conexión.
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
  // Solo vale la respuesta de la última carga (una lenta no pisa a una más nueva)
  const turno = useRef(0);

  const recargar = useCallback(async () => {
    const supabase = crearClienteNavegador();
    const mio = ++turno.current;
    try {
      const nuevos = await cargarRef.current(supabase);
      if (mio !== turno.current) return;
      setDatos(nuevos);
      setError(null);
    } catch (e) {
      if (mio !== turno.current) return;
      setError(e instanceof Error ? e.message : "Error al cargar los datos");
    } finally {
      if (mio === turno.current) setCargando(false);
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
    let primera = true;
    canal.subscribe((s) => { if (s === "SUBSCRIBED") { if (!primera) void recargar(); primera = false; } });
    const alVolver = () => { if (!document.hidden) void recargar(); };
    const alConectar = () => void recargar();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alConectar);

    return () => {
      clearTimeout(pendiente);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alConectar);
      void supabase.removeChannel(canal);
    };
  }, [clave, recargar]);

  return { datos, cargando, error, recargar };
}
