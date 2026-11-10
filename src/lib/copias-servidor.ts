import "server-only";

// Copia de seguridad: lee todo el CRM, genera el Excel, lo guarda en
// SharePoint y borra las copias de más de 12 semanas.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ESTADOS, type EstadoPresupuesto } from "@/lib/negocio";
import { uno } from "@/lib/datos/tipos";
import { ESTADOS_FACTURA, TIPOS_FACTURA, totalFactura } from "@/lib/facturacion";
import { generarExcelCopia, copiasQueSobran, fechaMadrid, nombreCopia, type DatosCopia, type Fila } from "@/lib/copias";
import { leerTodo } from "@/lib/supabase/leer-todo";
import { cantidadesDe, type FilaCantidades } from "@/lib/material";
import { calcularPyg, cuotaActivo, lineasPyg, type Activo, type Manual } from "@/lib/pyg";
import {
  TIPO_XLSX, asegurarCarpeta, eliminarElemento, listarCarpeta, rutaCopias, sharepointConfigurado, subir,
} from "@/lib/graph/sharepoint";

// Una tabla entera, por tandas de 1.000 (orden estable: se desempata por id)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todas(q: () => any): Promise<{ data: any[] | null; error: { message: string } | null }> {
  try {
    return { data: await leerTodo((desde, hasta) => q().range(desde, hasta)), error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Error al leer" } };
  }
}

export async function cargarDatosCopia(sb: SupabaseClient, ahora = new Date()): Promise<DatosCopia> {
  const [pr, ev, le, co, mv, te, ca, fa, ga, cg, ac, pm, mb] = await Promise.all([
    todas(() => sb.from("presupuestos").select("*, cliente:clientes(nombre), comercial:comerciales(nombre), intermediario:intermediarios(nombre)")
      .is("deleted_at", null).order("anio").order("numero").order("id")),
    todas(() => sb.from("eventos").select("*, cliente:clientes(nombre), presupuesto:presupuestos(codigo, uds_beduinas, uds_modulares, m2_tarima, uds_sombrillas, material)").is("deleted_at", null).order("fecha_inicio").order("id")),
    todas(() => sb.from("leads").select("*, comercial:comerciales(nombre)").is("deleted_at", null).order("fecha_primer_contacto").order("id")),
    todas(() => sb.from("cobros").select("*, presupuesto:presupuestos(codigo, cliente:clientes(nombre))").is("deleted_at", null).order("fecha").order("id")),
    todas(() => sb.from("material_movimientos").select("*, evento:eventos(cliente:clientes(nombre))").is("deleted_at", null).order("created_at").order("id")),
    sb.from("tipos_evento").select("codigo, nombre"),
    sb.from("canales_lead").select("codigo, nombre"),
    todas(() => sb.from("facturas").select("*, evento:eventos(cliente:clientes(nombre))").is("deleted_at", null)
      .order("anio", { nullsFirst: false }).order("numero", { nullsFirst: false }).order("id")),
    todas(() => sb.from("facturas_recibidas").select("*, proveedor:proveedores(nombre, nif), evento:eventos(cliente:clientes(nombre))").is("deleted_at", null).order("fecha").order("id")),
    sb.from("categorias_gasto").select("codigo, nombre, tipo"),
    sb.from("activos").select("*").order("fecha_compra"),
    sb.from("pyg_manual").select("mes, concepto, importe"),
    todas(() => sb.from("movimientos_banco").select("*, factura:facturas(codigo), recibida:facturas_recibidas(numero, proveedor:proveedores(nombre))").order("fecha").order("id")),
  ]);
  for (const r of [pr, ev, le, co, mv, fa, ga, ac, pm, mb]) if (r.error) throw new Error(r.error.message);
  const categorias = new Map((cg.data ?? []).map((c) => [c.codigo, c.nombre]));

  const tipos = new Map((te.data ?? []).map((t) => [t.codigo, t.nombre]));
  const canales = new Map((ca.data ?? []).map((t) => [t.codigo, t.nombre]));
  const activos: (Activo & { notas: string | null })[] = (ac.data ?? []).map((a) => ({ ...a, coste: Number(a.coste), cuota_manual: a.cuota_manual === null ? null : Number(a.cuota_manual) }));
  const pyg = cargarPyg(ev.data ?? [], fa.data ?? [], ga.data ?? [], activos, (pm.data ?? []) as Manual[], tipos, cg.data ?? [], ahora);
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
    gastos: (ga.data ?? []).map((g) => {
      const p = uno(g.proveedor) as { nombre: string; nif: string | null } | null;
      const e = uno(g.evento) as { cliente: unknown } | null;
      return {
        ...g, proveedor: p?.nombre, nif: p?.nif, estado: g.estado === "pagada" ? "Pagada" : "Por pagar",
        evento: (uno(e?.cliente) as { nombre: string } | null)?.nombre ?? "Gasto general",
        categoria: categorias.get(g.categoria) ?? g.categoria,
      };
    }),
    material: (mv.data ?? []).map((m) => {
      const e = uno(m.evento) as { cliente: unknown } | null;
      return { ...m, cliente: (uno(e?.cliente) as { nombre: string } | null)?.nombre };
    }),
    pyg,
    equipos: activos.map((a) => ({ ...a, cuota: Math.round(cuotaActivo({ ...a, cuota_manual: null }, a.fecha_compra.slice(0, 7)) * 100) / 100 })),
    banco: (mb.data ?? []).map((m) => {
      const f = uno(m.factura) as { codigo: string } | null;
      const r = uno(m.recibida) as { numero: string | null; proveedor: unknown } | null;
      const proveedor = (uno(r?.proveedor) as { nombre: string } | null)?.nombre;
      return {
        ...m, estado: { pendiente: "Por revisar", conciliado: "Conciliado", ignorado: "Ignorado" }[m.estado as string] ?? m.estado,
        enlace: f ? `Factura ${f.codigo}` : r ? [proveedor ?? "Gasto", r.numero && `nº ${r.numero}`].filter(Boolean).join(" ") : null,
      };
    }),
  };
}

// P&L de cada año desde 2026 hasta el actual, línea a línea (como la pantalla de Finanzas)
function cargarPyg(eventos: Fila[], facturas: Fila[], gastos: Fila[], activos: Activo[], manual: Manual[], tipos: Map<string, string>,
  categorias: { codigo: string; nombre: string; tipo: string }[], ahora: Date): Fila[] {
  const nombres = { tiposEvento: tipos, categorias: new Map(categorias.map((c) => [c.codigo, { nombre: c.nombre, tipo: c.tipo }])) };
  const ev = eventos.map((e) => ({ ...e, cliente: "", comision_pct: null, cantidades: cantidadesDe(uno(e.presupuesto) as FilaCantidades | null, e.material as string | null), importe: e.importe === null ? null : Number(e.importe), importe_retenido: e.importe_retenido === null ? null : Number(e.importe_retenido) })) as Parameters<typeof calcularPyg>[1];
  const fa = facturas.map((f) => ({ evento_id: f.evento_id as string | null, importe: Number(f.importe), estado: String(f.estado), fecha_emision: f.fecha_emision as string | null, tipo: f.tipo as string | null, descripcion: f.descripcion as string | null }));
  const ga = gastos.map((g) => ({ evento_id: g.evento_id as string | null, base: Number(g.base), fecha: String(g.fecha), categoria: g.categoria as string | null }));
  const filas: Fila[] = [];
  for (let anio = 2026; anio <= Number(fechaMadrid(ahora).slice(0, 4)); anio++) {
    const p = calcularPyg(anio, ev, ga, fa, activos, manual.map((m) => ({ ...m, importe: Number(m.importe) })), nombres);
    for (const { concepto, nivel, fila } of lineasPyg(p)) {
      filas.push({ anio, concepto: nivel ? `   ${concepto}` : concepto, negrita: nivel === 0,
        ...Object.fromEntries(fila.meses.map((x, i) => [`m${i + 1}`, x || null])), total: fila.total });
    }
  }
  return filas;
}

export type ResultadoCopia = { nombre: string; webUrl: string; borradas: string[]; filas: number };

export async function hacerCopia(sb: SupabaseClient, ahora = new Date()): Promise<ResultadoCopia> {
  if (!sharepointConfigurado()) throw new Error("SharePoint no está configurado");
  const datos = await cargarDatosCopia(sb, ahora);
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
