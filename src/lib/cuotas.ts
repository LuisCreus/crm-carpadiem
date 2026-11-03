// Proyectos de larga duración (carpa de temporada, p. ej. Peñalagos de marzo a noviembre):
// una cuota mensual que puede cambiar a partir de un mes, y una factura a final de cada mes.

export type Cuota = { desde: string; importe: number }; // desde: "aaaa-mm"

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;

// Cuota de un mes: la del último cambio que ya ha empezado
export function cuotaDelMes(cuotas: Cuota[], mes: string, porDefecto: number | null = null): number | null {
  const vigente = [...cuotas].sort((a, b) => a.desde.localeCompare(b.desde)).filter((c) => c.desde <= mes).at(-1);
  return vigente?.importe ?? porDefecto;
}

const siguienteMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
};
export const ultimoDia = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

// Meses de la temporada cuya factura ya toca: los terminados y el actual desde N días antes de fin de mes
export function mesesAFacturar(inicio: string, fin: string | null, hoy: string, diasAntes = 5): string[] {
  const meses: string[] = [];
  const actual = hoy.slice(0, 7);
  const ultimo = fin?.slice(0, 7);
  for (let m = inicio.slice(0, 7); m <= actual && (!ultimo || m <= ultimo); m = siguienteMes(m)) {
    if (m < actual) meses.push(m);
    else {
      const avisarDesde = new Date(`${ultimoDia(m)}T12:00:00Z`);
      avisarDesde.setUTCDate(avisarDesde.getUTCDate() - diasAntes);
      if (hoy >= avisarDesde.toISOString().slice(0, 10)) meses.push(m);
    }
  }
  return meses;
}

// Meses sin factura: si ya hay N mensualidades emitidas, se dan por facturados los N primeros
export function mensualidadesPendientes(inicio: string, fin: string | null, hoy: string, emitidas: number, diasAntes = 5): string[] {
  return mesesAFacturar(inicio, fin, hoy, diasAntes).slice(emitidas);
}
