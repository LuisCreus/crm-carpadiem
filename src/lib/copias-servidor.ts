import "server-only";

// Copia de seguridad: lee todo el CRM, genera el Excel, lo guarda en
// SharePoint y borra las copias de más de 12 semanas.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ESTADOS, type EstadoPresupuesto } from "@/lib/negocio";
import { uno } from "@/lib/datos/tipos";
import { ESTADOS_FACTURA, TIPOS_FACTURA, totalFactura } from "@/lib/facturacion";
import { generarExcelCopia, copiasQueSobran, nombreCopia, type DatosCopia } from "@/lib/copias";
import {
  TIPO_XLSX, asegurarCarpeta, eliminarElemento, listarCarpeta, rutaCopias, sharepointConfigurado, subir,
} from "@/lib/graph/sharepoint";

export async function cargarDatosCopia(sb: SupabaseClient): Promise<DatosCopia> {
  const [pr, ev, le, co, mv, te, ca, fa] = await Promise.all([
    sb.from("presupuestos").select("*, cliente:clientes(nombre), comercial:comerciales(nombre), intermediario:intermediarios(nombre)")
      .is("deleted_at", null).order("anio").order("numero"),
    sb.from("eventos").select("*, cliente:clientes(nombre), presupuesto:presupuestos(codigo)").is("deleted_at", null).order("fecha_inicio"),
    sb.from("leads").select("*, comercial:comerciales(nombre)").is("deleted_at", null).order("fecha_primer_contacto"),
    sb.from("cobros").select("*, presupuesto:presupuestos(codigo, cliente:clientes(nombre))").is("deleted_at", null).order("fecha"),
    sb.from("material_movimientos").select("*, evento:eventos(cliente:clientes(nombre))").is("deleted_at", null).order("created_at"),
    sb.from("tipos_evento").select("codigo, nombre"),
    sb.from("canales_lead").select("codigo, nombre"),
    sb.from("facturas").select("*, evento:eventos(cliente:clientes(nombre))").is("deleted_at", null)
      .order("anio", { nullsFirst: false }).order("numero", { nullsFirst: false }),
  ]);
  for (const r of [pr, ev, le, co, mv, fa]) if (r.error) throw new Error(r.error.message);

  const tipos = new Map((te.data ?? []).map((t) => [t.codigo, t.nombre]));
  const canales = new Map((ca.data ?? []).map((t) => [t.codigo, t.nombre]));
  const cobradoPor = new Map<string, number>();
  for (const c of co.data ?? []) cobradoPor.set(c.presupuesto_id, (cobradoPor.get(c.presupuesto_id) ?? 0) + Number(c.importe));

  return {
    presupuestos: (pr.data ?? []).map((p) => ({
      ...p,
      cliente: uno(p.cliente)?.nombre,
      comercial: uno(p.comercial)?.nombre,
      intermediario: uno(p.intermediario)?.nombre,
      estado: ESTADOS[p.estado as EstadoPresupuesto]?.texto ?? p.estado,
      tipo_evento: tipos.get(p.tipo_evento) ?? p.tipo_evento,
    })),
    eventos: (ev.data ?? []).map((e) => ({
      ...e,
      cliente: uno(e.cliente)?.nombre,
      codigo: uno(e.presupuesto)?.codigo,
      cobrado: e.presupuesto_id ? cobradoPor.get(e.presupuesto_id) ?? 0 : 0,
    })),
    leads: (le.data ?? []).map((l) => ({ ...l, comercial: uno(l.comercial)?.nombre, canal: canales.get(l.canal) ?? l.canal })),
    cobros: (co.data ?? []).map((c) => {
      const p = uno(c.presupuesto) as { codigo: string; cliente: unknown } | null;
      return { ...c, codigo: p?.codigo, cliente: (uno(p?.cliente) as { nombre: string } | null)?.nombre };
    }),
    facturas: (fa.data ?? []).map((f) => {
      const e = uno(f.evento) as { cliente: unknown } | null;
      const importes = { importe: Number(f.importe), iva_pct: Number(f.iva_pct), suplidos: Number(f.suplidos) };
      return {
        ...f, ...importes, total: totalFactura(importes).total,
        estado: ESTADOS_FACTURA[f.estado as keyof typeof ESTADOS_FACTURA]?.texto ?? f.estado,
        tipo: TIPOS_FACTURA[f.tipo as keyof typeof TIPOS_FACTURA] ?? f.tipo,
        evento: (uno(e?.cliente) as { nombre: string } | null)?.nombre,
      };
    }),
    material: (mv.data ?? []).map((m) => {
      const e = uno(m.evento) as { cliente: unknown } | null;
      return { ...m, cliente: (uno(e?.cliente) as { nombre: string } | null)?.nombre };
    }),
  };
}

export type ResultadoCopia = { nombre: string; webUrl: string; borradas: string[]; filas: number };

export async function hacerCopia(sb: SupabaseClient, ahora = new Date()): Promise<ResultadoCopia> {
  if (!sharepointConfigurado()) throw new Error("SharePoint no está configurado");
  const datos = await cargarDatosCopia(sb);
  const xlsx = await generarExcelCopia(datos, ahora);
  const carpeta = rutaCopias();
  await asegurarCarpeta(carpeta);
  const nombre = nombreCopia(ahora);
  const item = await subir(`${carpeta}/${nombre}`, xlsx, TIPO_XLSX);

  // Conservar solo las 12 últimas
  const archivos = await listarCarpeta(carpeta);
  const sobran = copiasQueSobran(archivos.map((a) => a.name));
  for (const a of archivos.filter((x) => sobran.includes(x.name))) await eliminarElemento(a.id);

  const filas = Object.values(datos).reduce((s, l) => s + l.length, 0);
  return { nombre, webUrl: item.webUrl, borradas: sobran, filas };
}
