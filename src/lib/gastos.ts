// Cálculos de las facturas recibidas (gastos), sin base de datos.

const redondear = (n: number) => Math.round((n + Math.sign(n) * Number.EPSILON) * 100 * (1 + Number.EPSILON)) / 100;

// Igual que en la base de datos: base + IVA − retención de IRPF
export function totalRecibida(base: number, ivaPct: number, irpfPct: number): number {
  return redondear(base + base * ivaPct / 100 - base * irpfPct / 100);
}

// Suma de gastos de un evento (sin IVA, para compararlo con lo facturado)
export function gastosEvento(gastos: { base: number }[]): number {
  return redondear(gastos.reduce((s, g) => s + g.base, 0));
}
