import type { EstadoPresupuesto, PrecisionFecha } from "@/lib/negocio";

export type Opcion = { codigo: string; nombre: string; reserva_pct?: number | null; tipo?: string };
export type Comercial = { id: string; nombre: string };
export type IntermediarioCorto = { id: string; nombre: string; comision_pct: number | null };

export type Contacto = {
  id: string;
  nombre: string;
  rol: string | null;
  telefono: string | null;
  email: string | null;
};

export type PresupuestoLista = {
  id: string;
  numero: number;
  anio: number;
  codigo: string;
  estado: EstadoPresupuesto;
  fecha_precision: PrecisionFecha;
  fecha_evento: string | null;
  fecha_fin: string | null;
  ubicacion: string | null;
  provincia: string | null;
  material: string | null;
  importe: number | null;
  tipo_evento: string | null;
  created_at: string;
  oportunidad_id: string | null;
  cliente: { id: string; nombre: string } | null;
  comercial: { nombre: string } | null;
};

export const SELECT_PRESUPUESTO_LISTA =
  "id, numero, anio, codigo, estado, fecha_precision, fecha_evento, fecha_fin, ubicacion, provincia, material, importe, tipo_evento, created_at, oportunidad_id, cliente:clientes(id, nombre), comercial:comerciales(nombre)";

export type Presupuesto = PresupuestoLista & {
  cliente_id: string;
  lead_id: string | null;
  intermediario_id: string | null;
  comision_pct: number | null;
  comercial_id: string | null;
  reserva_pct: number | null;
  plantilla: "carpadiem" | "neutra";
  motivo_rechazo: string | null;
  enviado_at: string | null;
  version_enviada: number | null;
  carpeta_importada: boolean;
  sp_carpeta_url: string | null;
  sp_carpeta_ruta: string | null;
  intermediario: { id: string; nombre: string } | null;
  cliente: { id: string; nombre: string; tipo_cliente: string | null } | null;
};

export const SELECT_PRESUPUESTO =
  "*, cliente:clientes(id, nombre, tipo_cliente), comercial:comerciales(nombre), intermediario:intermediarios(id, nombre)";

export type Version = {
  id: string;
  version: number;
  importe: number | null;
  nombre_archivo: string | null;
  docx_item_id: string | null;
  docx_ruta: string | null;
  pdf_item_id: string | null;
  pdf_storage: string | null;
  pdf_url: string | null;
  docx_url: string | null;
  pdf_generado_at: string | null;
  enviado_at: string | null;
  created_at: string;
};

export type Cobro = {
  id: string;
  fecha: string;
  importe: number;
  concepto: "reserva" | "resto" | "otro";
  notas: string | null;
};

export type Evento = {
  id: string;
  presupuesto_id: string | null;
  cliente_id: string;
  tipo_evento: string | null;
  fecha_precision: PrecisionFecha;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  ubicacion: string | null;
  provincia: string | null;
  maps_url: string | null;
  material: string | null;
  importe: number | null;
  modalidad: "confirmado" | "seguro";
  estado: "activo" | "cancelado_reserva_retenida" | "cancelado";
  importe_retenido: number | null;
  comentarios: string | null;
  es_larga_duracion: boolean;
  montaje_inicio: string | null;
  montaje_fin: string | null;
  desmontaje_inicio: string | null;
  desmontaje_fin: string | null;
  observaciones_montaje: string | null;
  contacto_destino_id: string | null;
  hoja_montaje_url: string | null;
  hoja_montaje_item_id: string | null;
  cuota_mensual: number | null;
} & DatosFacturacion & {
  cliente: ({ id: string; nombre: string } & DatosFacturacion) | null;
  presupuesto: { id: string; codigo: string; estado: EstadoPresupuesto; reserva_pct: number | null; comision_pct: number | null } | null;
};

export const SELECT_EVENTO =
  "*, cliente:clientes(id, nombre, fact_nombre, fact_nif, fact_domicilio, fact_cp_ciudad, fact_email), presupuesto:presupuestos(id, codigo, estado, reserva_pct, comision_pct)";

// Datos de facturación (en el cliente, en el evento si se factura a otro, y congelados en cada factura)
export type DatosFacturacion = {
  fact_nombre: string | null;
  fact_nif: string | null;
  fact_domicilio: string | null;
  fact_cp_ciudad: string | null;
  fact_email: string | null;
};

export type TipoFactura = "reserva" | "resto" | "mensualidad" | "otra";
export type EstadoFactura = "prevista" | "emitida" | "pagada";

export type Factura = DatosFacturacion & {
  id: string;
  evento_id: string | null;
  cliente_id: string | null;
  tipo: TipoFactura;
  concepto: string | null;
  descripcion: string | null;
  importe: number;
  iva_pct: number;
  suplidos: number;
  estado: EstadoFactura;
  anio: number | null;
  numero: number | null;
  codigo: string | null;
  fecha_emision: string | null;
  fecha_pago: string | null;
  automatica: boolean;
  comentarios: string | null;
  pdf_item_id: string | null;
  pdf_url: string | null;
  pdf_nombre: string | null;
  correo_preparado_at: string | null;
  correo_para: string | null;
};

export const SELECT_FACTURA =
  "id, evento_id, cliente_id, tipo, concepto, descripcion, importe, iva_pct, suplidos, estado, anio, numero, codigo, fecha_emision, fecha_pago, automatica, comentarios, fact_nombre, fact_nif, fact_domicilio, fact_cp_ciudad, fact_email, pdf_item_id, pdf_url, pdf_nombre, correo_preparado_at, correo_para";

// Los numeric llegan como texto: se pasan a número
export function aFactura(f: Record<string, unknown>): Factura {
  return { ...(f as Factura), importe: Number(f.importe), iva_pct: Number(f.iva_pct), suplidos: Number(f.suplidos) };
}

export const CONCEPTOS_COBRO = { reserva: "Reserva", resto: "Resto", otro: "Otro" } as const;

// Algunas relaciones llegan como array según cómo las infiere Supabase
export function uno<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

export function aNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------
// Facturas recibidas (gastos) y proveedores
// ---------------------------------------------------------------------
export type Proveedor = { id: string; nombre: string; nif: string | null; iban: string | null; email: string | null; categoria: string | null };

export type FacturaRecibida = {
  id: string;
  proveedor_id: string | null;
  numero: string | null;
  fecha: string;
  vencimiento: string | null;
  concepto: string | null;
  evento_id: string | null;
  categoria: string | null;
  base: number;
  iva_pct: number;
  irpf_pct: number;
  total: number;
  iban: string | null;
  estado: "pendiente" | "pagada";
  fecha_pago: string | null;
  fichero_pago_at: string | null;
  archivo_item_id: string | null;
  archivo_nombre: string | null;
  comentarios: string | null;
  proveedor: { id: string; nombre: string; nif: string | null } | null;
  evento: { id: string; fecha_inicio: string | null; cliente: { nombre: string } | null } | null;
};

export const SELECT_FACTURA_RECIBIDA =
  "id, proveedor_id, numero, fecha, vencimiento, concepto, evento_id, categoria, base, iva_pct, irpf_pct, total, iban, estado, fecha_pago, fichero_pago_at, archivo_item_id, archivo_nombre, comentarios, proveedor:proveedores(id, nombre, nif), evento:eventos(id, fecha_inicio, cliente:clientes(nombre))";

export function aFacturaRecibida(f: Record<string, unknown>): FacturaRecibida {
  const ev = uno(f.evento) as (FacturaRecibida["evento"] & { cliente: unknown }) | null;
  return {
    ...(f as FacturaRecibida),
    base: Number(f.base), iva_pct: Number(f.iva_pct), irpf_pct: Number(f.irpf_pct), total: Number(f.total),
    proveedor: uno(f.proveedor) as FacturaRecibida["proveedor"],
    evento: ev && { ...ev, cliente: uno(ev.cliente) as { nombre: string } | null },
  };
}
