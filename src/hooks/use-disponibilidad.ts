"use client";

import { useMemo } from "react";
import { useCompartido } from "@/hooks/use-compartido";
import { uno } from "@/lib/datos/tipos";
import { diasMaterial, faltas, siSeAcepta, textoFalta, type Compromiso, type Falta } from "@/lib/disponibilidad";
import { formatoFecha } from "@/lib/formato";
import { cantidadesDe, SIN_MATERIAL, type Cantidades, type FilaCantidades } from "@/lib/material";

type Datos = { capacidad: Cantidades; confirmados: Compromiso[]; pendientes: Compromiso[] };
const CANTIDADES = "uds_beduinas, uds_modulares, m2_tarima, uds_sombrillas, material";

// Material comprometido (eventos activos) y presupuestos pendientes, para avisar si falta material
export function useDisponibilidad() {
  const { datos } = useCompartido<Datos>("disponibilidad", ["eventos", "presupuestos", "inventario"], async (sb) => {
    const [inv, ev, pr] = await Promise.all([
      sb.from("inventario").select("recurso, cantidad, equivale").not("recurso", "is", null).is("deleted_at", null),
      sb.from("eventos").select(`id, fecha_precision, fecha_inicio, fecha_fin, montaje_inicio, desmontaje_inicio, desmontaje_fin, es_larga_duracion, material, cliente:clientes(nombre), presupuesto:presupuestos(${CANTIDADES})`)
        .eq("estado", "activo").is("deleted_at", null),
      sb.from("presupuestos").select(`id, codigo, fecha_precision, fecha_evento, fecha_fin, ${CANTIDADES}, cliente:clientes(nombre)`)
        .in("estado", ["borrador", "pendiente"]).is("deleted_at", null),
    ]);
    const fallo = [inv, ev, pr].find((r) => r.error);
    if (fallo?.error) throw new Error(fallo.error.message);
    const capacidad = { ...SIN_MATERIAL };
    for (const i of inv.data ?? []) capacidad[i.recurso as keyof Cantidades] = Number(i.cantidad) * Number(i.equivale);
    const confirmados: Compromiso[] = [];
    for (const e of ev.data ?? []) {
      const dias = diasMaterial(e);
      if (!dias) continue;
      confirmados.push({ id: e.id, nombre: (uno(e.cliente) as { nombre: string } | null)?.nombre ?? "Evento", ...dias,
        cantidades: cantidadesDe(uno(e.presupuesto) as FilaCantidades | null, e.material) });
    }
    const pendientes: Compromiso[] = [];
    for (const p of pr.data ?? []) {
      const dias = diasMaterial({ fecha_precision: p.fecha_precision, fecha_inicio: p.fecha_evento, fecha_fin: p.fecha_fin });
      if (!dias) continue;
      pendientes.push({ id: p.id, nombre: `${p.codigo} · ${(uno(p.cliente) as { nombre: string } | null)?.nombre ?? ""}`, ...dias, cantidades: cantidadesDe(p as FilaCantidades) });
    }
    return { capacidad, confirmados, pendientes };
  });

  return useMemo(() => {
    if (!datos) return { listo: false, faltasConfirmadas: [] as Falta[], avisos: new Map<string, string[]>(), capacidad: SIN_MATERIAL, confirmados: [] as Compromiso[], siSeAceptara: () => [] as Falta[] };
    const faltasConfirmadas = faltas(datos.confirmados, datos.capacidad);
    // Para cada evento o presupuesto, sus avisos en texto
    const avisos = new Map<string, string[]>();
    const anadir = (id: string, f: Falta) => avisos.set(id, [...(avisos.get(id) ?? []), `${textoFalta(f)} · ${rango(f)}`]);
    for (const f of faltasConfirmadas) for (const id of f.ids) anadir(id, f);
    for (const p of datos.pendientes) for (const f of siSeAcepta(p, datos.confirmados, datos.capacidad)) anadir(p.id, f);
    return {
      listo: true, faltasConfirmadas, avisos, capacidad: datos.capacidad, confirmados: datos.confirmados,
      // Para un presupuesto con otras cantidades o fechas (el formulario)
      siSeAceptara: (c: Compromiso) => siSeAcepta(c, datos.confirmados, datos.capacidad),
    };
  }, [datos]);
}

export const rango = (f: Falta) => (f.desde === f.hasta ? `el ${formatoFecha(f.desde)}` : `del ${formatoFecha(f.desde)} al ${formatoFecha(f.hasta)}`);
