// Formatos de España: importes "13.246 €" y fechas "dd/mm/aaaa".

const eurosEnteros = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
  useGrouping: "always",
});
const eurosConCentimos = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
});

export function formatoEuros(importe: number | null | undefined): string {
  if (importe === null || importe === undefined || Number.isNaN(importe)) return "—";
  // Intl usa un espacio duro antes del €; lo normalizamos a espacio normal
  const formato = Number.isInteger(importe) ? eurosEnteros : eurosConCentimos;
  return formato.format(importe).replace(/ /g, " ");
}

export function formatoPorcentaje(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(valor)} %`;
}

// Acepta "2027-05-08", un Date o un timestamp ISO
export function formatoFecha(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const fecha = typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? new Date(`${valor}T12:00:00`)
    : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "—";
  const dd = String(fecha.getDate()).padStart(2, "0");
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${fecha.getFullYear()}`;
}

export function formatoFechaHora(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "—";
  const hh = String(fecha.getHours()).padStart(2, "0");
  const mi = String(fecha.getMinutes()).padStart(2, "0");
  return `${formatoFecha(fecha)} ${hh}:${mi}`;
}

// "CD 078"
export function codigoPresupuesto(numero: number): string {
  return `CD ${String(numero).padStart(3, "0")}`;
}

// Lee un importe escrito a la española: "1.500", "3.973,80", "13246 €" → número (null si no se entiende)
export function leerEuros(texto: string): number | null {
  let t = texto.replace(/[€\s]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

// Fecha de hoy (aaaa-mm-dd) en hora de Madrid, no en UTC
export function hoyMadrid(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(ahora);
}
