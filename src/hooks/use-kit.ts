"use client";

import { useCompartido } from "@/hooks/use-compartido";
import { uno } from "@/lib/datos/tipos";
import type { PiezaKit, Recurso } from "@/lib/material";

// Qué piezas lleva cada carpa (o cada m² de tarima), con lo que hay en el almacén
export function useKit() {
  const { datos } = useCompartido<PiezaKit[]>("kit", ["kit_material", "inventario"], async (sb) => {
    const { data, error } = await sb.from("kit_material")
      .select("recurso, por_unidad, inventario:inventario(id, material, cantidad, grupo, orden, deleted_at)");
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((k) => ({ k, i: uno(k.inventario) as { id: string; material: string; cantidad: number; grupo: string | null; orden: number; deleted_at: string | null } | null }))
      .filter(({ i }) => i && !i.deleted_at)
      .sort((a, b) => a.i!.orden - b.i!.orden)
      .map(({ k, i }) => ({ recurso: k.recurso as Recurso, inventarioId: i!.id, material: i!.material, porUnidad: Number(k.por_unidad), stock: Number(i!.cantidad), grupo: i!.grupo }));
  });
  return datos ?? [];
}
