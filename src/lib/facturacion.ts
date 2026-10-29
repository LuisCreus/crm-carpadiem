// Cálculos de facturación (sin base de datos), para el evento, la lista de facturas y los avisos.
import type { EstadoFactura, Factura, TipoFactura } from "@/lib/datos/tipos";
import { limpiarNombre } from "@/lib/negocio";

export const TIPOS_FACTURA: Record<TipoFactura, string> = {
  reserva: "Reserva",
  resto: "Resto",
  mensualidad: "Mensualidad",
  otra: "Otra",
};

export const ESTADOS_FACTURA: Record<EstadoFactura, { texto: string; clase: string }> = {
  prevista: { texto: "Por emitir", clase: "bg-muted text-muted-foreground" },
  emitida: { texto: "Emitida", clase: "bg-[#FDF3E1] text-[#8A5A0B]" },
  pagada: { texto: "Pagada", clase: "bg-[#E8F4EC] text-[#25683D]" },
};

const redondear = (n: number) => Math.round(n * 100) / 100;

// Base + IVA + suplidos, como en la hoja "Emitir"
export function totalFactura(f: Pick<Factura, "importe" | "iva_pct" | "suplidos">) {
  const iva = redondear(f.importe * f.iva_pct / 100);
  return { base: f.importe, iva, total: redondear(f.importe + iva + f.suplidos) };
}

// Resumen de un evento (importes sin IVA, como el presupuesto)
export function resumenFacturacion(importeEvento: number | null, facturas: Factura[], cobrado: number) {
  const emitidas = facturas.filter((f) => f.estado !== "prevista" && f.tipo !== "mensualidad");
  const facturado = redondear(emitidas.reduce((s, f) => s + f.importe, 0));
  const total = importeEvento ?? 0;
  return {
    total,
    facturado,
    porFacturar: redondear(Math.max(total - facturado, 0)),
    cobrado,
    porCobrar: redondear(Math.max(total - cobrado, 0)),
  };
}

// Mes en mayúsculas para el concepto: "OCTUBRE de 2026"
const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
export function conceptoMensualidad(fecha: string): string {
  return `Honorarios correspondientes a servicio de CARPAS en ${MESES[Number(fecha.slice(5, 7)) - 1]} de ${fecha.slice(0, 4)}`;
}

// "FACTURA CD 26 CARLOTA DURÁN.pdf", con el nombre de a quién se factura (como las de 01. PENDIENTE SARA)
export function nombreArchivoFactura(numero: number, facturadoA: string): string {
  return `FACTURA CD ${numero} ${limpiarNombre(facturadoA).toLocaleUpperCase("es-ES")}.pdf`;
}
