import type { PrecisionFecha } from "@/lib/negocio";

export type MesPeriodo = { anio: number; mes: number }; // mes 1-12

export type ItemFecha = { fecha_precision: PrecisionFecha; inicio: string | null; fin: string | null };

const clave = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, "0")}`;

// Los 12 meses de un año, o los próximos 12 desde el mes de "hoy"
export function mesesDelPeriodo(periodo: number | "proximos", hoy: string): MesPeriodo[] {
  const [anioHoy, mesHoy] = hoy.split("-").map(Number);
  const inicio = periodo === "proximos" ? { anio: anioHoy, mes: mesHoy } : { anio: periodo, mes: 1 };
  return Array.from({ length: 12 }, (_, i) => {
    const total = inicio.mes - 1 + i;
    return { anio: inicio.anio + Math.floor(total / 12), mes: (total % 12) + 1 };
  });
}

function ultimoDia(anio: number, mes: number) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

// ¿Ocupa este evento algún día del mes? (los "por definir" no aparecen)
export function estaEnMes(item: ItemFecha, { anio, mes }: MesPeriodo): boolean {
  if (item.fecha_precision === "por_definir" || !item.inicio) return false;
  const primero = `${clave(anio, mes)}-01`;
  const ultimo = `${clave(anio, mes)}-${String(ultimoDia(anio, mes)).padStart(2, "0")}`;
  if (item.fecha_precision === "mes") return item.inicio.slice(0, 7) === clave(anio, mes);
  const fin = item.fin && item.fin > item.inicio ? item.fin : item.inicio;
  return item.inicio <= ultimo && fin >= primero;
}

// ¿Empieza en este mes? (el importe se cuenta solo en el mes en que empieza)
export function empiezaEnMes(item: ItemFecha, { anio, mes }: MesPeriodo): boolean {
  return !!item.inicio && item.fecha_precision !== "por_definir" && item.inicio.slice(0, 7) === clave(anio, mes);
}

// Texto del día en la tarjeta: "08", "08–10", "1–31" (si cruza meses) o "s/d" (solo mes)
export function textoDias(item: ItemFecha, { anio, mes }: MesPeriodo): string {
  if (item.fecha_precision !== "dia" || !item.inicio) return "s/d";
  const fin = item.fin && item.fin > item.inicio ? item.fin : item.inicio;
  const k = clave(anio, mes);
  const desde = item.inicio.slice(0, 7) < k ? 1 : Number(item.inicio.slice(8, 10));
  const hasta = fin.slice(0, 7) > k ? ultimoDia(anio, mes) : Number(fin.slice(8, 10));
  const dd = (n: number) => String(n).padStart(2, "0");
  return desde === hasta ? dd(desde) : `${dd(desde)}–${dd(hasta)}`;
}

// Orden dentro del mes: primero por el día en que empieza
export function ordenEnMes(item: ItemFecha): string {
  return item.fecha_precision === "dia" ? item.inicio ?? "9999" : `${item.inicio?.slice(0, 7) ?? "9999"}-99`;
}

// Días (yyyy-mm-dd) de la cuadrícula de un mes, empezando en lunes
export function diasCalendario(anio: number, mes: number): (string | null)[] {
  const primero = new Date(Date.UTC(anio, mes - 1, 1));
  const huecos = (primero.getUTCDay() + 6) % 7;
  const dias: (string | null)[] = Array(huecos).fill(null);
  for (let d = 1; d <= ultimoDia(anio, mes); d++) dias.push(`${clave(anio, mes)}-${String(d).padStart(2, "0")}`);
  while (dias.length % 7) dias.push(null);
  return dias;
}
