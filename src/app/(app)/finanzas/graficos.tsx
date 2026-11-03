"use client";

// Gráficos de Finanzas, en SVG y HTML sencillos (sin librerías).
// Colores validados para daltonismo: ingresos azul, gastos naranja; ganancia verde, pérdida rojo.

import { useState } from "react";
import { formatoEuros } from "@/lib/formato";
import { cn } from "@/lib/utils";

export const COLOR = { ingresos: "#2a78d6", gastos: "#eb6834", gana: "#008300", pierde: "#e34948" };
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const euros = (n: number) => formatoEuros(Math.round(n));
const corto = (n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10} k€`.replace(".", ",") : `${Math.round(n)} €`);

// Escala "bonita" del eje: 0, 5 k, 10 k…
function marcas(min: number, max: number) {
  const rango = Math.max(max - min, 1);
  const paso = [1, 2, 2.5, 5, 10].map((x) => x * 10 ** Math.floor(Math.log10(rango / 4))).find((p) => rango / p <= 5) ?? rango;
  const desde = Math.floor(min / paso) * paso, hasta = Math.ceil(max / paso) * paso;
  return Array.from({ length: Math.round((hasta - desde) / paso) + 1 }, (_, i) => desde + i * paso);
}

function Leyenda({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map(([t, c]) => <span key={t} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: c }} />{t}</span>)}
    </div>
  );
}

function Tarjeta({ titulo, subtitulo, leyenda, children, className }: { titulo: string; subtitulo?: string; leyenda?: [string, string][]; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card p-4", className)}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {subtitulo && <span className="text-xs text-muted-foreground">{subtitulo}</span>}
        {leyenda && <div className="ml-auto"><Leyenda items={leyenda} /></div>}
      </div>
      {children}
    </section>
  );
}

// Barras por mes (una o dos series, o una con signo). Al pasar el ratón por un mes sale el detalle.
function BarrasMes({ series, detalle }: {
  series: { nombre: string; color: string | ((v: number) => string); valores: number[] }[];
  detalle?: (i: number) => [string, number][];
}) {
  const [activo, setActivo] = useState<number | null>(null);
  const todos = series.flatMap((s) => s.valores);
  const ejes = marcas(Math.min(0, ...todos), Math.max(0, ...todos));
  const [min, max] = [ejes[0], ejes[ejes.length - 1]];
  const W = 640, H = 210, izq = 44, abajo = 22, arriba = 6;
  const y = (v: number) => arriba + (H - arriba - abajo) * (1 - (v - min) / (max - min || 1));
  const anchoMes = (W - izq) / 12, ancho = Math.min(16, (anchoMes - 10) / series.length);
  const barra = (v: number, x: number, color: string, k: string) => {
    const [y0, y1] = [y(0), y(v)];
    const alto = Math.abs(y1 - y0);
    if (alto < 0.5) return null;
    const r = Math.min(4, alto, ancho / 2);
    const top = Math.min(y0, y1);
    // Esquinas redondeadas solo en el extremo del dato
    const d = v >= 0
      ? `M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + ancho - r} Q${x + ancho},${top} ${x + ancho},${top + r} V${y0} Z`
      : `M${x},${y0} V${top + alto - r} Q${x},${top + alto} ${x + r},${top + alto} H${x + ancho - r} Q${x + ancho},${top + alto} ${x + ancho},${top + alto - r} V${y0} Z`;
    return <path key={k} d={d} fill={color} />;
  };
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={series.map((s) => s.nombre).join(" y ") + " por mes"} onMouseLeave={() => setActivo(null)}>
        {ejes.map((v) => (
          <g key={v}>
            <line x1={izq} x2={W} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#b8b6b0" : "#ecebe8"} strokeWidth={1} />
            <text x={izq - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="#8a8984">{corto(v)}</text>
          </g>
        ))}
        {MESES.map((m, i) => {
          const x0 = izq + i * anchoMes;
          const inicio = x0 + (anchoMes - (ancho * series.length + 2 * (series.length - 1))) / 2;
          return (
            <g key={m} onMouseEnter={() => setActivo(i)} onClick={() => setActivo(i)}>
              <rect x={x0} y={0} width={anchoMes} height={H - abajo} fill={activo === i ? "#f4f3f0" : "transparent"} />
              {series.map((s, k) => barra(s.valores[i], inicio + k * (ancho + 2), typeof s.color === "function" ? s.color(s.valores[i]) : s.color, `${m}${k}`))}
              <text x={x0 + anchoMes / 2} y={H - 6} textAnchor="middle" fontSize={10} fill={activo === i ? "#0b0b0b" : "#8a8984"}>{m}</text>
            </g>
          );
        })}
      </svg>
      {activo !== null && (
        <div className="pointer-events-none absolute top-1 z-10 min-w-40 rounded-lg border bg-card px-3 py-2 text-xs shadow-sm"
          style={activo < 6 ? { left: `${((izq + (activo + 1) * anchoMes) / W) * 100}%` } : { right: `${100 - ((izq + activo * anchoMes) / W) * 100}%` }}>
          <div className="mb-1 font-medium">{MESES[activo]}</div>
          {(detalle ? detalle(activo) : series.map((s) => [s.nombre, s.valores[activo]] as [string, number])).map(([t, v]) => (
            <div key={t} className="flex justify-between gap-4"><span className="text-muted-foreground">{t}</span><span className="tabular-nums">{euros(v)}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

export function GraficoIngresosGastos({ ingresos, gastos, detalle }: { ingresos: number[]; gastos: number[]; detalle: (i: number) => [string, number][] }) {
  return (
    <Tarjeta titulo="Ingresos y gastos por mes" subtitulo="facturado · gastos sin amortización" leyenda={[["Ingresos", COLOR.ingresos], ["Gastos", COLOR.gastos]]}>
      <BarrasMes series={[{ nombre: "Ingresos", color: COLOR.ingresos, valores: ingresos }, { nombre: "Gastos", color: COLOR.gastos, valores: gastos }]} detalle={detalle} />
    </Tarjeta>
  );
}

export function GraficoBeneficio({ neto }: { neto: number[] }) {
  const acum = neto.map((_, i) => neto.slice(0, i + 1).reduce((s, x) => s + x, 0));
  const acumulado = acum[11] ?? 0;
  return (
    <Tarjeta titulo="Beneficio neto por mes" subtitulo={`acumulado: ${euros(acumulado)}`} leyenda={[["Gana", COLOR.gana], ["Pierde", COLOR.pierde]]}>
      <BarrasMes series={[{ nombre: "Beneficio neto", color: (v) => (v >= 0 ? COLOR.gana : COLOR.pierde), valores: neto }]}
        detalle={(i) => [["Beneficio del mes", neto[i]], ["Acumulado del año", acum[i]]]} />
    </Tarjeta>
  );
}

// Barras horizontales ordenadas (dónde va el dinero, de dónde viene)
export function Ranking({ titulo, subtitulo, filas, color, total }: { titulo: string; subtitulo?: string; filas: { nombre: string; total: number }[]; color: string; total: number }) {
  const max = Math.max(...filas.map((f) => f.total), 1);
  return (
    <Tarjeta titulo={titulo} subtitulo={subtitulo}>
      {filas.length === 0 && <p className="text-sm text-muted-foreground">Sin datos este año.</p>}
      <ul className="grid gap-2">
        {filas.map((f) => (
          <li key={f.nombre} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs" title={`${f.nombre}: ${euros(f.total)}`}>
            <span className="truncate text-muted-foreground">{f.nombre}</span>
            <span className="h-2.5 rounded-r" style={{ width: `${Math.max(2, (f.total / max) * 100)}%`, background: color }} />
            <span className="tabular-nums">{euros(f.total)} <span className="text-muted-foreground">· {total ? Math.round((f.total / total) * 100) : 0} %</span></span>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}
