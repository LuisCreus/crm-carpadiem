// Conciliación: para cada movimiento del banco, el CRM propone con qué va.
//   · Entra dinero → una factura emitida con ese total (mejor si el concepto lleva su número o el cliente).
//   · Sale dinero → una factura recibida con ese total (mejor si el concepto lleva el proveedor o el nº).
//   · Si no, una regla guardada ("MICROSOFT" → Licencias de Microsoft).
// Siempre lo confirma una persona.

export type MovimientoC = { id: string; fecha: string; concepto: string; importe: number };
export type EmitidaC = { id: string; codigo: string | null; anio: number | null; numero: number | null; total: number; estado: string; cliente: string | null };
export type RecibidaC = { id: string; numero: string | null; total: number; estado: string; proveedor: string | null; fecha: string };
export type ReglaC = { id: string; patron: string; categoria: string | null; proveedor_id: string | null; ignorar: boolean };

export type Propuesta =
  | { tipo: "cobro"; factura: EmitidaC; seguro: boolean }
  | { tipo: "pago"; recibida: RecibidaC; seguro: boolean }
  | { tipo: "regla"; regla: ReglaC }
  | null;

export const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase().replace(/[^A-Z0-9/]+/g, " ").trim();

const PALABRAS_VACIAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "SL", "SLU", "SA", "S", "L", "U", "ENTIDAD", "CLIENTE"]);
const palabras = (s: string | null) => normalizar(s ?? "").split(" ").filter((p) => p.length > 3 && !PALABRAS_VACIAS.has(p));

const mismoImporte = (a: number, b: number) => Math.abs(Math.abs(a) - Math.abs(b)) < 0.01;

function puntosEmitida(concepto: string, f: EmitidaC) {
  let p = 0;
  if (f.anio && f.numero && (concepto.includes(`${f.anio}/${f.numero}`) || new RegExp(`\\bCD\\s*0*${f.numero}\\b`).test(concepto))) p += 2;
  if (palabras(f.cliente).some((w) => concepto.includes(w))) p += 1;
  return p;
}

function puntosRecibida(concepto: string, r: RecibidaC) {
  let p = 0;
  if (r.numero && concepto.includes(normalizar(r.numero))) p += 2;
  if (palabras(r.proveedor).some((w) => concepto.includes(w))) p += 1;
  return p;
}

// Mejor candidata: la de más puntos; a igualdad, las que faltan por cobrar/pagar antes. "Seguro" si
// hay pistas en el concepto o si es la única con ese importe.
function mejor<T extends { estado: string }>(candidatas: T[], puntos: (x: T) => number, pendiente: string) {
  if (!candidatas.length) return null;
  const ordenadas = candidatas
    .map((x) => ({ x, p: puntos(x) + (x.estado === pendiente ? 0.5 : 0) }))
    .sort((a, b) => b.p - a.p);
  return { elegida: ordenadas[0].x, seguro: ordenadas[0].p >= 1 || candidatas.length === 1 };
}

export function proponer(
  m: MovimientoC,
  emitidas: EmitidaC[],
  recibidas: RecibidaC[],
  reglas: ReglaC[],
  yaUsadas: Set<string> = new Set(),
): Propuesta {
  const concepto = normalizar(m.concepto);
  if (m.importe > 0) {
    const r = mejor(emitidas.filter((f) => f.estado !== "prevista" && !yaUsadas.has(f.id) && mismoImporte(f.total, m.importe)), (f) => puntosEmitida(concepto, f), "emitida");
    if (r) return { tipo: "cobro", factura: r.elegida, seguro: r.seguro };
  } else {
    const r = mejor(recibidas.filter((f) => !yaUsadas.has(f.id) && mismoImporte(f.total, m.importe)), (f) => puntosRecibida(concepto, f), "pendiente");
    if (r) return { tipo: "pago", recibida: r.elegida, seguro: r.seguro };
  }
  const regla = reglas.find((x) => x.patron.trim() && concepto.includes(normalizar(x.patron)));
  return regla ? { tipo: "regla", regla } : null;
}

// Patrón que se propone para recordar un movimiento: las primeras palabras con letras
// ("RECIBO MICROSOFT IRELAND OPERATIONS 4471" → "MICROSOFT IRELAND")
const GENERICAS = new Set(["RECIBO", "TRANSFERENCIA", "TRANSF", "PAGO", "COMPRA", "TARJETA", "CARGO", "ADEUDO", "DOMICILIADO", "A", "FAVOR", "EN", "CON", "POR", "SEPA", "BIZUM", "OPERACION"]);
export function patronSugerido(concepto: string): string {
  return normalizar(concepto).split(" ")
    .filter((p) => /[A-Z]/.test(p) && !/\d/.test(p) && !GENERICAS.has(p) && !PALABRAS_VACIAS.has(p))
    .slice(0, 2).join(" ");
}
