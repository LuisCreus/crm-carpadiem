// ¿Hay material para ese día? Solo lo grande: beduinas, modulares, m² de tarima y sombrillas.
//   · Ocupan material los eventos activos (confirmados y con seguro de lluvia).
//   · Los presupuestos pendientes no ocupan: se avisa de lo que pasaría si se aceptan.
//   · Días: del montaje al desmontaje; si no están puestos, el día antes, el evento y el día después.
//     Los proyectos de larga duración, todo su periodo.

import { RECURSOS, type Cantidades, type Recurso } from "@/lib/material";
import { rangoOcupacion, solapesMaterial, sumarDias } from "@/lib/operativa";
import type { PrecisionFecha } from "@/lib/negocio";

export type Compromiso = { id: string; nombre: string; desde: string; hasta: string; cantidades: Cantidades };
export type Falta = { recurso: Recurso; desde: string; hasta: string; pedido: number; disponible: number; nombres: string[]; ids: string[] };

export function diasMaterial(e: {
  fecha_precision: PrecisionFecha; fecha_inicio: string | null; fecha_fin: string | null;
  montaje_inicio?: string | null; desmontaje_inicio?: string | null; desmontaje_fin?: string | null; es_larga_duracion?: boolean;
}): { desde: string; hasta: string } | null {
  const r = rangoOcupacion(e);
  if (!r) return null;
  if (e.es_larga_duracion || e.fecha_precision === "mes") return r;
  return {
    desde: e.montaje_inicio ? r.desde : sumarDias(r.desde, -1),
    hasta: e.desmontaje_inicio || e.desmontaje_fin ? r.hasta : sumarDias(r.hasta, 1),
  };
}

export function faltas(compromisos: Compromiso[], capacidad: Cantidades): Falta[] {
  const ocupacion = compromisos.map((c) => ({
    id: c.id, nombre: c.nombre, desde: c.desde, hasta: c.hasta,
    material: RECURSOS.map((r) => ({ inventarioId: r.clave, cantidad: c.cantidades[r.clave] })),
  }));
  const inventario = RECURSOS.map((r) => ({ id: r.clave, material: r.clave, cantidad: capacidad[r.clave] }));
  return solapesMaterial(ocupacion, inventario).map((s) => ({
    recurso: s.inventarioId as Recurso, desde: s.desde, hasta: s.hasta, pedido: s.pedido, disponible: s.disponible, nombres: s.eventos, ids: s.eventoIds,
  }));
}

// Lo que faltaría si se acepta este presupuesto (con lo que ya está confirmado esos días)
export function siSeAcepta(nuevo: Compromiso, confirmados: Compromiso[], capacidad: Cantidades): Falta[] {
  return faltas([...confirmados.filter((c) => c.id !== nuevo.id), nuevo], capacidad).filter((f) => f.ids.includes(nuevo.id));
}

// "Faltan 1 beduina (3 de 3 ya ocupadas)"
export function textoFalta(f: Falta): string {
  const r = RECURSOS.find((x) => x.clave === f.recurso)!;
  const falta = Math.round((f.pedido - f.disponible) * 100) / 100;
  return `${falta === 1 ? "Falta" : "Faltan"} ${falta} ${falta === 1 ? r.uno : r.corto} (se piden ${f.pedido}, hay ${f.disponible})`;
}
