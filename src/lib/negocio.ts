// Reglas del negocio que también se usan en pantalla (y se prueban con tests).

export type EstadoPresupuesto =
  | "borrador" | "pendiente" | "aceptado" | "reserva_pagada" | "pagado"
  | "rechazado" | "caducado" | "descartada";

export type PrecisionFecha = "dia" | "mes" | "por_definir";

export const ESTADOS: Record<EstadoPresupuesto, { texto: string; clase: string }> = {
  borrador: { texto: "Borrador", clase: "bg-[#F2F1EE] text-[#4B4B48]" },
  pendiente: { texto: "Pendiente", clase: "bg-[#FDF3E1] text-[#8A5A0B]" },
  aceptado: { texto: "Aceptado", clase: "bg-[#E8F4EC] text-[#25683D]" },
  reserva_pagada: { texto: "Reserva pagada", clase: "bg-[#EEF4F7] text-[#2F5D70]" },
  pagado: { texto: "Pagado 100 %", clase: "bg-[#DDEFE3] text-[#1D5631]" },
  rechazado: { texto: "Rechazado", clase: "bg-[#FDEDEC] text-[#B0302A]" },
  caducado: { texto: "Caducado", clase: "bg-[#F2F1EE] text-[#6B6A66]" },
  descartada: { texto: "Descartada", clase: "bg-[#F2F1EE] text-[#6B6A66] line-through" },
};

export const ESTADOS_ACEPTADOS: EstadoPresupuesto[] = ["aceptado", "reserva_pagada", "pagado"];

// Estados que se pueden elegir a mano (aceptar y los de pago tienen su propio botón o se calculan)
export const ESTADOS_MANUALES: EstadoPresupuesto[] = ["borrador", "pendiente", "rechazado", "caducado"];

export const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const redondear = (n: number) => Math.round(n * 100) / 100;

export function importeReserva(importe: number | null, reservaPct: number | null): number | null {
  if (importe === null || reservaPct === null) return null;
  return redondear((importe * reservaPct) / 100);
}

// Igual que public.estado_pago en la base de datos
export function estadoPago(importe: number | null, reservaPct: number | null, cobrado: number): EstadoPresupuesto {
  if (importe !== null && importe > 0 && cobrado >= importe) return "pagado";
  if (cobrado > 0 && cobrado >= (importeReserva(importe ?? 0, reservaPct ?? 0) ?? 0)) return "reserva_pagada";
  return "aceptado";
}

// ---------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------

function partes(fechaIso: string) {
  const [anio, mes, dia] = fechaIso.split("-").map(Number);
  return { anio, mes, dia };
}

const dos = (n: number) => String(n).padStart(2, "0");

// "08/05/2027", "junio de 2027" o "Por definir"
export function textoFechaEvento(precision: PrecisionFecha, fecha: string | null, fechaFin?: string | null): string {
  if (precision === "por_definir" || !fecha) return "Por definir";
  const { anio, mes, dia } = partes(fecha);
  if (precision === "mes") return `${MESES[mes - 1]} de ${anio}`;
  const inicio = `${dos(dia)}/${dos(mes)}/${anio}`;
  if (fechaFin && fechaFin !== fecha) {
    const f = partes(fechaFin);
    return `${inicio} – ${dos(f.dia)}/${dos(f.mes)}/${f.anio}`;
  }
  return inicio;
}

export function diaSemana(fecha: string): string {
  const { anio, mes, dia } = partes(fecha);
  return new Date(anio, mes - 1, dia).toLocaleDateString("es-ES", { weekday: "long" });
}

function sumarDias(fecha: string, dias: number): string {
  const { anio, mes, dia } = partes(fecha);
  const d = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return d.toISOString().slice(0, 10);
}

// Seguro de lluvia: el cliente decide hasta N días antes (10 por defecto)
export function fechaLimiteSeguro(fechaEvento: string, diasAntes = 10): string {
  return sumarDias(fechaEvento, -diasAntes);
}

// Avisar desde N días antes del límite (3 por defecto), hasta el propio límite
export function avisarSeguro(fechaEvento: string, hoy: string, diasAntes = 10, diasAviso = 3): boolean {
  const limite = fechaLimiteSeguro(fechaEvento, diasAntes);
  return hoy >= sumarDias(limite, -diasAviso) && hoy <= limite;
}

// ---------------------------------------------------------------------
// Nombres de carpetas y archivos en SharePoint
// ---------------------------------------------------------------------

export const RAIZ_CLIENTES = "CARPA DIEM/01. CLIENTES";

// SharePoint no admite " * : < > ? / \ | ni espacios al principio o al final
export function limpiarNombre(nombre: string): string {
  return nombre
    .replace(/["*:<>?/\\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "");
}

const mayusculas = (s: string) => limpiarNombre(s).toLocaleUpperCase("es-ES");

// CARPA DIEM/01. CLIENTES/2027/05. MAYO/08-05 CARLOTA DURÁN
// Solo mes: …/2027/06. JUNIO/XX-06 NOMBRE · Por definir: …/POR DEFINIR/NOMBRE
export function rutaCarpetaCliente(precision: PrecisionFecha, fecha: string | null, cliente: string): string {
  const nombre = mayusculas(cliente);
  if (precision === "por_definir" || !fecha) return `${RAIZ_CLIENTES}/POR DEFINIR/${nombre}`;
  const { anio, mes, dia } = partes(fecha);
  const carpetaMes = `${dos(mes)}. ${MESES[mes - 1].toLocaleUpperCase("es-ES")}`;
  const prefijo = precision === "mes" ? `XX-${dos(mes)}` : `${dos(dia)}-${dos(mes)}`;
  return `${RAIZ_CLIENTES}/${anio}/${carpetaMes}/${prefijo} ${nombre}`;
}

// PRESUPUESTO CD 078 CARLOTA DURÁN V01.docx
export function nombreArchivoPresupuesto(numero: number, cliente: string, version: number, extension: "docx" | "pdf"): string {
  return `PRESUPUESTO CD ${String(numero).padStart(3, "0")} ${mayusculas(cliente)} V${dos(version)}.${extension}`;
}

// HOJA DE MONTAJE CD 078 CARLOTA DURÁN.pdf
export function nombreHojaMontaje(numero: number, cliente: string): string {
  return `HOJA DE MONTAJE CD ${String(numero).padStart(3, "0")} ${mayusculas(cliente)}.pdf`;
}

export function enlaceMaps(direccion: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
}

// Fecha aproximada escrita a mano en un lead: "08/05/2027", "2027-05-08", "05/2027", "junio 2027"
export function leerFechaAprox(texto: string): { precision: "dia" | "mes"; fecha: string } | null {
  const t = texto.trim().toLowerCase();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return { precision: "dia", fecha: t };
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (m) return { precision: "dia", fecha: `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` };
  m = /^(\d{1,2})[/-](\d{4})$/.exec(t);
  if (m) return { precision: "mes", fecha: `${m[2]}-${m[1].padStart(2, "0")}-01` };
  const mes = MESES.findIndex((n) => t.startsWith(n.toLowerCase()));
  m = /(\d{4})/.exec(t);
  if (mes >= 0 && m) return { precision: "mes", fecha: `${m[1]}-${String(mes + 1).padStart(2, "0")}-01` };
  return null;
}
