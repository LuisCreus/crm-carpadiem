// Operativa de eventos: control de material, solapes de inventario, avisos y números.
// Funciones puras (sin base de datos) para poder probarlas con tests.

import { avisarSeguro, fechaLimiteSeguro, type EstadoPresupuesto, type PrecisionFecha } from "@/lib/negocio";

// ---------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------

export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

export const diaDe = (fechaHora: string | null | undefined) => (fechaHora ? fechaHora.slice(0, 10) : null);

// Lunes y domingo de la semana de "hoy"
export function semanaDe(hoy: string): { desde: string; hasta: string } {
  const [a, m, d] = hoy.split("-").map(Number);
  const dia = (new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7;
  const desde = sumarDias(hoy, -dia);
  return { desde, hasta: sumarDias(desde, 6) };
}

// ---------------------------------------------------------------------
// Control de material por evento: OK / FALTAN / SOBRAN
// ---------------------------------------------------------------------

export type Movimiento = { material: string; cantidad: number; sentido: "sale" | "entra" };
export type EstadoMaterial = "pendiente" | "ok" | "faltan" | "sobran";
export type LineaControl = { material: string; sale: number; entra: number; estado: EstadoMaterial; diferencia: number };

const claveMaterial = (m: string) => m.trim().toLocaleLowerCase("es-ES").replace(/\s+/g, " ");

export function controlMaterial(movimientos: Movimiento[]): LineaControl[] {
  const lineas = new Map<string, LineaControl & { conEntrada: boolean }>();
  for (const mv of movimientos) {
    const k = claveMaterial(mv.material);
    const l = lineas.get(k) ?? { material: mv.material.trim(), sale: 0, entra: 0, estado: "pendiente", diferencia: 0, conEntrada: false };
    if (mv.sentido === "sale") l.sale += mv.cantidad;
    else { l.entra += mv.cantidad; l.conEntrada = true; }
    lineas.set(k, l);
  }
  return [...lineas.values()].map(({ conEntrada, ...l }) => {
    const diferencia = l.entra - l.sale;
    const estado: EstadoMaterial = !conEntrada ? "pendiente" : diferencia === 0 ? "ok" : diferencia < 0 ? "faltan" : "sobran";
    return { ...l, diferencia, estado };
  });
}

// ---------------------------------------------------------------------
// Ocupación de material: avisa si eventos solapados piden más de lo que hay
// ---------------------------------------------------------------------

export type EventoOcupacion = {
  id: string;
  nombre: string;
  // Días que el material está fuera: del montaje al desmontaje (o las fechas del evento)
  desde: string;
  hasta: string;
  material: { inventarioId: string; cantidad: number }[];
};
export type Inventario = { id: string; material: string; cantidad: number };
export type Solape = { inventarioId: string; material: string; desde: string; hasta: string; pedido: number; disponible: number; eventos: string[]; eventoIds: string[] };

export function rangoOcupacion(e: {
  fecha_precision: PrecisionFecha; fecha_inicio: string | null; fecha_fin: string | null;
  montaje_inicio?: string | null; desmontaje_fin?: string | null; desmontaje_inicio?: string | null;
}): { desde: string; hasta: string } | null {
  if (e.fecha_precision === "por_definir" || !e.fecha_inicio) return null;
  let desde = e.fecha_inicio;
  let hasta = e.fecha_fin && e.fecha_fin > e.fecha_inicio ? e.fecha_fin : e.fecha_inicio;
  if (e.fecha_precision === "mes") {
    // Solo mes: se reserva el mes entero para no quedarse corto
    const [a, m] = e.fecha_inicio.split("-").map(Number);
    desde = `${a}-${String(m).padStart(2, "0")}-01`;
    hasta = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  }
  const montaje = diaDe(e.montaje_inicio);
  const desmontaje = diaDe(e.desmontaje_fin ?? e.desmontaje_inicio);
  if (montaje && montaje < desde) desde = montaje;
  if (desmontaje && desmontaje > hasta) hasta = desmontaje;
  return { desde, hasta };
}

export function solapesMaterial(eventos: EventoOcupacion[], inventario: Inventario[]): Solape[] {
  const resultado: Solape[] = [];
  for (const item of inventario) {
    const usan = eventos.filter((e) => e.material.some((m) => m.inventarioId === item.id && m.cantidad > 0));
    if (!usan.length) continue;
    // Recorrer los días en los que cambia la ocupación
    const fechas = [...new Set(usan.flatMap((e) => [e.desde, sumarDias(e.hasta, 1)]))].sort();
    let actual: Solape | null = null;
    for (let i = 0; i < fechas.length - 1; i++) {
      const dia = fechas[i];
      const activos = usan.filter((e) => e.desde <= dia && dia <= e.hasta);
      const pedido = activos.reduce((s, e) => s + cantidadDe(e, item.id), 0);
      const hastaTramo = sumarDias(fechas[i + 1], -1);
      if (pedido > item.cantidad) {
        const nombres = activos.map((e) => e.nombre);
        if (actual && actual.pedido === pedido && actual.eventos.join() === nombres.join() && sumarDias(actual.hasta, 1) === dia) {
          actual.hasta = hastaTramo;
        } else {
          actual = { inventarioId: item.id, material: item.material, desde: dia, hasta: hastaTramo, pedido, disponible: item.cantidad, eventos: nombres, eventoIds: activos.map((e) => e.id) };
          resultado.push(actual);
        }
      } else {
        actual = null;
      }
    }
  }
  return resultado.sort((a, b) => a.desde.localeCompare(b.desde));
}

function cantidadDe(e: EventoOcupacion, inventarioId: string) {
  return e.material.filter((m) => m.inventarioId === inventarioId).reduce((s, m) => s + m.cantidad, 0);
}

// ---------------------------------------------------------------------
// Avisos (Inicio)
// ---------------------------------------------------------------------

export type TipoAviso = "seguimiento" | "accion_lead" | "montaje" | "desmontaje" | "seguro" | "cobro";
export type Aviso = { tipo: TipoAviso; fecha: string; titulo: string; detalle: string; href: string; urgente: boolean };

export type PresupuestoAvisos = {
  id: string; codigo: string; cliente: string; estado: EstadoPresupuesto; enviado_at: string | null;
};
export type EventoAvisos = {
  id: string; cliente: string; estado: string; modalidad: "confirmado" | "seguro";
  fecha_precision: PrecisionFecha; fecha_inicio: string | null; fecha_fin: string | null;
  montaje_inicio: string | null; desmontaje_inicio: string | null;
  importe: number | null; cobrado: number; ubicacion: string | null;
};
export type LeadAvisos = { id: string; cliente_nombre: string; estado: string; proxima_accion_fecha: string | null; proxima_accion_texto: string | null };

export type AjustesAvisos = { diasSeguimiento: number; diasLimiteSeguro: number; diasAvisoSeguro: number };

const hora = (fechaHora: string) => new Date(fechaHora).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

export function calcularAvisos(
  hoy: string,
  datos: { presupuestos: PresupuestoAvisos[]; eventos: EventoAvisos[]; leads: LeadAvisos[] },
  ajustes: AjustesAvisos,
): Aviso[] {
  const avisos: Aviso[] = [];
  const { hasta: finSemana } = semanaDe(hoy);
  const manana = sumarDias(hoy, 1);

  // Seguimiento: enviado hace N días o más y sigue Pendiente
  for (const p of datos.presupuestos) {
    if (p.estado !== "pendiente" || !p.enviado_at) continue;
    const toca = sumarDias(diaDe(p.enviado_at)!, ajustes.diasSeguimiento);
    if (toca <= hoy) {
      avisos.push({ tipo: "seguimiento", fecha: toca, titulo: `${p.codigo} · ${p.cliente}`, detalle: `Enviado el ${formatoCorto(diaDe(p.enviado_at)!)} · sin respuesta`, href: `/presupuestos/${p.id}`, urgente: true });
    }
  }

  // Próximas acciones de leads, vencidas o de esta semana
  for (const l of datos.leads) {
    if (!l.proxima_accion_fecha || ["ganado", "perdido"].includes(l.estado) || l.proxima_accion_fecha > finSemana) continue;
    avisos.push({ tipo: "accion_lead", fecha: l.proxima_accion_fecha, titulo: l.cliente_nombre, detalle: l.proxima_accion_texto || "Próxima acción", href: "/leads", urgente: l.proxima_accion_fecha <= hoy });
  }

  for (const e of datos.eventos) {
    if (e.estado !== "activo") continue;
    const montaje = diaDe(e.montaje_inicio);
    if (montaje && montaje >= hoy && montaje <= finSemana) {
      avisos.push({ tipo: "montaje", fecha: montaje, titulo: e.cliente, detalle: `${e.ubicacion ?? ""} · ${hora(e.montaje_inicio!)}`.replace(/^ · /, ""), href: `/eventos/${e.id}`, urgente: montaje <= manana });
    }
    const desmontaje = diaDe(e.desmontaje_inicio);
    if (desmontaje && desmontaje >= hoy && desmontaje <= finSemana) {
      avisos.push({ tipo: "desmontaje", fecha: desmontaje, titulo: e.cliente, detalle: `${e.ubicacion ?? ""} · ${hora(e.desmontaje_inicio!)}`.replace(/^ · /, ""), href: `/eventos/${e.id}`, urgente: desmontaje <= manana });
    }
    // Seguro de lluvia: avisar desde N días antes del plazo
    if (e.modalidad === "seguro" && e.fecha_precision === "dia" && e.fecha_inicio) {
      const limite = fechaLimiteSeguro(e.fecha_inicio, ajustes.diasLimiteSeguro);
      if (avisarSeguro(e.fecha_inicio, hoy, ajustes.diasLimiteSeguro, ajustes.diasAvisoSeguro) || (limite < hoy && e.fecha_inicio >= hoy)) {
        avisos.push({ tipo: "seguro", fecha: limite, titulo: e.cliente, detalle: limite < hoy ? `Plazo vencido el ${formatoCorto(limite)}: ¿sigue adelante?` : `Decide como tarde el ${formatoCorto(limite)}`, href: `/eventos/${e.id}`, urgente: limite <= hoy });
      }
    }
    // Cobro pendiente después del evento
    const fin = e.fecha_fin ?? e.fecha_inicio;
    if (e.fecha_precision === "dia" && fin && fin < hoy && e.importe !== null && e.cobrado < e.importe) {
      avisos.push({ tipo: "cobro", fecha: fin, titulo: e.cliente, detalle: `Evento del ${formatoCorto(fin)} · faltan ${(e.importe - e.cobrado).toLocaleString("es-ES", { maximumFractionDigits: 2 })} €`, href: `/eventos/${e.id}`, urgente: true });
    }
  }

  return avisos.sort((a, b) => Number(b.urgente) - Number(a.urgente) || a.fecha.localeCompare(b.fecha));
}

function formatoCorto(fecha: string) {
  const [a, m, d] = fecha.split("-");
  return `${d}/${m}/${a}`;
}

// ---------------------------------------------------------------------
// Números del mes y del año
// ---------------------------------------------------------------------

export type PresupuestoNumeros = { estado: EstadoPresupuesto; enviado_at: string | null; importe: number | null; reserva_pct: number | null; anio?: number };
export type Numeros = {
  enviados: number;
  aceptados: number;
  tasaAceptacion: number | null;
  presupuestado: number;
  aceptado: number;
};

const ACEPTADOS: EstadoPresupuesto[] = ["aceptado", "reserva_pagada", "pagado"];

// Sobre los presupuestos ENVIADOS en el periodo (aaaa-mm o aaaa). Los importados del
// Excel no tienen fecha de envío: cuentan en el año de su número, pero no en ningún mes.
// Las "Descartada" no cuentan: son otras opciones de una oportunidad que ya se aceptó.
function enviadoEn(p: PresupuestoNumeros, periodo: string): boolean {
  if (p.estado === "descartada") return false;
  if (p.enviado_at) return diaDe(p.enviado_at)!.startsWith(periodo);
  return periodo.length === 4 && p.estado !== "borrador" && String(p.anio) === periodo;
}

export function numerosPeriodo(presupuestos: PresupuestoNumeros[], periodo: string): Numeros {
  const delPeriodo = presupuestos.filter((p) => enviadoEn(p, periodo));
  const aceptadosLista = delPeriodo.filter((p) => ACEPTADOS.includes(p.estado));
  return {
    enviados: delPeriodo.length,
    aceptados: aceptadosLista.length,
    tasaAceptacion: delPeriodo.length ? aceptadosLista.length / delPeriodo.length : null,
    presupuestado: delPeriodo.reduce((s, p) => s + (p.importe ?? 0), 0),
    aceptado: aceptadosLista.reduce((s, p) => s + (p.importe ?? 0), 0),
  };
}

// Reservas cobradas frente a pendientes de los presupuestos aceptados
export function reservas(presupuestos: (PresupuestoNumeros & { cobrado: number })[]): { cobradas: number; pendientes: number } {
  let cobradas = 0;
  let pendientes = 0;
  for (const p of presupuestos.filter((x) => ACEPTADOS.includes(x.estado))) {
    const reserva = Math.round((p.importe ?? 0) * (p.reserva_pct ?? 0)) / 100;
    cobradas += Math.min(p.cobrado, reserva || p.cobrado);
    pendientes += Math.max(reserva - p.cobrado, 0);
  }
  return { cobradas, pendientes };
}
