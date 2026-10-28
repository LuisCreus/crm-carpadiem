"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Cabecera } from "@/components/cabecera";
import { Etiqueta, CLASE_CONFIRMADO, CLASE_SEGURO } from "@/components/etiqueta-estado";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { textoCobro, useEventos } from "@/hooks/use-eventos";
import { nombreDe, useListas } from "@/hooks/use-listas";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { uno } from "@/lib/datos/tipos";
import { formatoEuros } from "@/lib/formato";
import { MESES, type PrecisionFecha } from "@/lib/negocio";
import {
  diasCalendario, empiezaEnMes, estaEnMes, mesesDelPeriodo, ordenEnMes, textoDias,
  type ItemFecha, type MesPeriodo,
} from "@/lib/planificacion";
import { cn } from "@/lib/utils";

type Tarjeta = ItemFecha & {
  id: string;
  href: string;
  cliente: string;
  tipo: string;
  material: string;
  lugar: string;
  importe: number | null;
  clase: "confirmado" | "seguro" | "pendiente";
  cobro?: { texto: string; completo: boolean };
  montaje?: string | null; // fecha y hora (ISO) del montaje
  desmontaje?: string | null;
};

type PresuPendiente = {
  id: string; codigo: string; fecha_precision: PrecisionFecha; fecha_evento: string | null; fecha_fin: string | null;
  material: string | null; ubicacion: string | null; provincia: string | null; importe: number | null; tipo_evento: string | null;
  cliente: { nombre: string } | null;
};

const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Planificacion({ mesDetalle }: { mesDetalle?: string }) {
  const listas = useListas();
  const hoy = new Date().toISOString().slice(0, 10);
  const [periodo, setPeriodo] = useState<number | "proximos">(Number(hoy.slice(0, 4)));
  const [verPendientes, setVerPendientes] = useState(false);
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set([hoy.slice(0, 7)]));

  const eventos = useEventos();
  const pendientes = useTablaEnVivo<PresuPendiente>(["presupuestos", "clientes"], async (sb) => {
    const { data } = await sb.from("presupuestos")
      .select("id, codigo, fecha_precision, fecha_evento, fecha_fin, material, ubicacion, provincia, importe, tipo_evento, cliente:clientes(nombre)")
      .eq("estado", "pendiente").is("deleted_at", null);
    return (data ?? []).map((p) => ({ ...p, cliente: uno(p.cliente) })) as PresuPendiente[];
  });

  const tarjetas = useMemo<Tarjeta[]>(() => {
    const ev: Tarjeta[] = eventos.datos.filter((e) => e.estado === "activo").map((e) => ({
      id: e.id, href: `/eventos/${e.id}`, fecha_precision: e.fecha_precision, inicio: e.fecha_inicio, fin: e.fecha_fin,
      cliente: e.cliente?.nombre ?? "", tipo: nombreDe(listas.tiposEvento, e.tipo_evento), material: e.material ?? "",
      lugar: [e.ubicacion, e.provincia].filter(Boolean).join(", "), importe: e.importe,
      clase: e.modalidad, cobro: textoCobro(e, formatoEuros), montaje: e.montaje_inicio, desmontaje: e.desmontaje_inicio,
    }));
    if (!verPendientes) return ev;
    return [...ev, ...pendientes.datos.map((p): Tarjeta => ({
      id: p.id, href: `/presupuestos/${p.id}`, fecha_precision: p.fecha_precision, inicio: p.fecha_evento, fin: p.fecha_fin,
      cliente: `${p.codigo} · ${p.cliente?.nombre ?? ""}`, tipo: nombreDe(listas.tiposEvento, p.tipo_evento), material: p.material ?? "",
      lugar: [p.ubicacion, p.provincia].filter(Boolean).join(", "), importe: p.importe !== null ? Number(p.importe) : null, clase: "pendiente",
    }))];
  }, [eventos.datos, pendientes.datos, verPendientes, listas.tiposEvento]);

  const meses = mesesDelPeriodo(periodo, hoy).map((m) => {
    const delMes = tarjetas.filter((t) => estaEnMes(t, m)).sort((a, b) => ordenEnMes(a).localeCompare(ordenEnMes(b)));
    const cerrados = delMes.filter((t) => t.clase !== "pendiente");
    return {
      ...m,
      clave: `${m.anio}-${String(m.mes).padStart(2, "0")}`,
      tarjetas: delMes,
      n: cerrados.length,
      total: cerrados.filter((t) => empiezaEnMes(t, m)).reduce((s, t) => s + (t.importe ?? 0), 0),
    };
  });
  const totalN = meses.reduce((s, m) => s + m.n, 0);
  const totalImporte = meses.reduce((s, m) => s + m.total, 0);

  if (mesDetalle) {
    return <DetalleMes clave={mesDetalle} tarjetas={tarjetas} verPendientes={verPendientes} setVerPendientes={setVerPendientes} />;
  }

  const cambiarAnio = (delta: number) => setPeriodo((p) => (p === "proximos" ? Number(hoy.slice(0, 4)) : p) + delta);

  return (
    <>
      <Cabecera titulo="Planificación" subtitulo={`${totalN} eventos cerrados · ${formatoEuros(totalImporte)}`}>
        <div role="group" aria-label="Año" className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Año anterior" onClick={() => cambiarAnio(-1)}><ChevronLeft className="size-4" aria-hidden /></Button>
          <span className="min-w-14 text-center font-semibold">{periodo === "proximos" ? "12 meses" : periodo}</span>
          <Button variant="outline" size="icon" aria-label="Año siguiente" onClick={() => cambiarAnio(1)}><ChevronRight className="size-4" aria-hidden /></Button>
        </div>
        <Button variant={periodo === "proximos" ? "secondary" : "outline"} onClick={() => setPeriodo(periodo === "proximos" ? Number(hoy.slice(0, 4)) : "proximos")}>
          Próximos 12 meses
        </Button>
        <label className="flex items-center gap-2 rounded-lg border bg-card px-3 text-sm">
          <Switch checked={verPendientes} onCheckedChange={setVerPendientes} />
          Mostrar presupuestos pendientes
        </label>
      </Cabecera>

      <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span><Etiqueta className={CLASE_CONFIRMADO}>Confirmado</Etiqueta> va sí o sí</span>
        <span><Etiqueta className={CLASE_SEGURO}>Seguro</Etiqueta> seguro de lluvia</span>
        <span><Etiqueta className="border border-dashed border-[#BDBBB5] bg-card">Pendiente</Etiqueta> presupuesto sin aceptar</span>
      </div>

      {/* Ordenador: cuadrícula de 12 meses */}
      <div className="hidden grid-cols-2 gap-3.5 md:grid xl:grid-cols-4">
        {meses.map((m) => (
          <section key={m.clave} aria-label={`${MESES[m.mes - 1]} ${m.anio}`}
            className={cn("flex min-h-56 flex-col gap-2 rounded-xl border bg-card p-3.5", m.clave === hoy.slice(0, 7) && "border-[#F4B8B5]")}>
            <div className="flex items-baseline gap-2">
              <Link href={`/planificacion?mes=${m.clave}`} className="flex-1 font-semibold hover:underline">
                {mayus(MESES[m.mes - 1])}{periodo === "proximos" && ` ${m.anio}`}
              </Link>
              <span className="text-xs text-muted-foreground">{m.n ? `${m.n} ${m.n === 1 ? "evento" : "eventos"} · ${formatoEuros(m.total)}` : "—"}</span>
            </div>
            {m.tarjetas.length === 0 && <p className="py-5 text-center text-xs text-muted-foreground">Sin eventos</p>}
            {m.tarjetas.map((t) => <TarjetaEvento key={t.id} t={t} mes={m} />)}
          </section>
        ))}
      </div>

      {/* Móvil: lista vertical por meses, plegable */}
      <div className="grid gap-2.5 md:hidden">
        {meses.map((m) => {
          const abierto = abiertos.has(m.clave);
          return (
            <section key={m.clave} className="overflow-hidden rounded-xl border bg-card">
              <button type="button" aria-expanded={abierto} className="flex min-h-13 w-full items-center gap-2.5 px-4 text-left"
                onClick={() => setAbiertos((s) => { const n = new Set(s); if (n.has(m.clave)) n.delete(m.clave); else n.add(m.clave); return n; })}>
                <span className="flex-1 font-semibold">{mayus(MESES[m.mes - 1])} {periodo === "proximos" && m.anio}</span>
                <span className="text-[13px] text-muted-foreground">{m.n ? `${m.n} · ${formatoEuros(m.total)}` : "—"}</span>
                <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", abierto && "rotate-90")} aria-hidden />
              </button>
              {abierto && (
                <div className="grid gap-2 px-3 pb-3">
                  {m.tarjetas.length === 0 && <p className="py-2 text-center text-xs text-muted-foreground">Sin eventos</p>}
                  {m.tarjetas.map((t) => <TarjetaEvento key={t.id} t={t} mes={m} />)}
                  <Link href={`/planificacion?mes=${m.clave}`} className="pt-1 text-center text-[13px]">Ver calendario</Link>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function TarjetaEvento({ t, mes }: { t: Tarjeta; mes: MesPeriodo }) {
  const pendiente = t.clase === "pendiente";
  return (
    <Link href={t.href}
      className={cn("block rounded-lg border px-2.5 py-2 text-xs leading-snug",
        pendiente ? "border-dashed border-[#BDBBB5] bg-card opacity-75" : "bg-background hover:border-foreground/20")}>
      <div className="flex items-center gap-1.5">
        <b className="font-semibold">{textoDias(t, mes)}</b>
        <span className="min-w-0 flex-1 truncate font-medium">{t.cliente}</span>
        <Etiqueta className={cn("px-1.5 text-[11px]", t.clase === "seguro" ? CLASE_SEGURO : t.clase === "confirmado" ? CLASE_CONFIRMADO : "bg-muted text-muted-foreground")}>
          {t.clase === "seguro" ? "Seguro" : t.clase === "confirmado" ? "Confirmado" : "Pendiente"}
        </Etiqueta>
      </div>
      <div className="mt-0.5 truncate text-muted-foreground">{[t.tipo, t.material].filter(Boolean).join(" · ")}</div>
      <div className="mt-0.5 flex justify-between gap-2 text-muted-foreground">
        <span className="truncate">{t.lugar}</span>
        {t.cobro && <span className={cn("shrink-0", t.cobro.completo && "text-[#25683D]")}>{t.cobro.completo ? "● " : "○ "}{t.cobro.texto}</span>}
      </div>
    </Link>
  );
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const diaLocal = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

type Entrada = { key: string; href: string; texto: string; titulo: string; clase: string; hora?: string };

// Lo que pasa cada día: el evento, su montaje y su desmontaje (cada uno en su color)
function entradasDelDia(tarjetas: Tarjeta[], dia: string): Entrada[] {
  const r: Entrada[] = [];
  for (const t of tarjetas) {
    if (t.montaje && diaLocal(t.montaje) === dia) {
      r.push({ key: `${t.id}-m`, href: t.href, texto: `Montaje · ${t.cliente}`, titulo: `Montaje ${hora(t.montaje)} · ${t.lugar}`, hora: hora(t.montaje), clase: "bg-[#EEF4F7] text-[#2F5D70]" });
    }
    if (t.fecha_precision === "dia" && t.inicio) {
      const fin = t.fin && t.fin > t.inicio ? t.fin : t.inicio;
      if (t.inicio <= dia && dia <= fin) {
        r.push({ key: t.id, href: t.href, texto: t.cliente, titulo: `${t.cliente} · ${t.material}`,
          clase: t.clase === "seguro" ? CLASE_SEGURO : t.clase === "confirmado" ? CLASE_CONFIRMADO : "border border-dashed border-[#BDBBB5] text-muted-foreground" });
      }
    }
    if (t.desmontaje && diaLocal(t.desmontaje) === dia) {
      r.push({ key: `${t.id}-d`, href: t.href, texto: `Desmontaje · ${t.cliente}`, titulo: `Desmontaje ${hora(t.desmontaje)} · ${t.lugar}`, hora: hora(t.desmontaje), clase: "bg-[#F2F1EE] text-[#4B4B48]" });
    }
  }
  return r;
}

function DetalleMes({ clave, tarjetas, verPendientes, setVerPendientes }: {
  clave: string; tarjetas: Tarjeta[]; verPendientes: boolean; setVerPendientes: (v: boolean) => void;
}) {
  const [anio, mes] = clave.split("-").map(Number);
  const m = { anio, mes };
  const delMes = tarjetas.filter((t) => estaEnMes(t, m) || (t.montaje && diaLocal(t.montaje).startsWith(clave)) || (t.desmontaje && diaLocal(t.desmontaje).startsWith(clave)));
  const dias = diasCalendario(anio, mes);
  const semanas = Array.from({ length: dias.length / 7 }, (_, i) => dias.slice(i * 7, i * 7 + 7));
  const anterior = mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, "0")}`;
  const siguiente = mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, "0")}`;
  const sinDia = delMes.filter((t) => t.fecha_precision !== "dia" && estaEnMes(t, m));
  const hoy = new Date().toISOString().slice(0, 10);
  const [vista, setVista] = useState<"mes" | "semana">("mes");
  const semanaHoy = semanas.findIndex((s) => s.includes(hoy));
  const [semana, setSemana] = useState(semanaHoy >= 0 ? semanaHoy : 0);

  const celda = (dia: string | null, i: number, grande: boolean) => (
    <div key={i} className={cn("border-b border-r p-1.5 [&:nth-child(7n)]:border-r-0", grande ? "min-h-64" : "min-h-24", !dia && "bg-muted/40")}>
      {dia && (
        <>
          <div className={cn("mb-1 w-fit rounded-full px-1.5 font-medium", dia === hoy && "bg-brand text-white")}>{Number(dia.slice(8))}</div>
          <div className="grid gap-1">
            {entradasDelDia(delMes, dia).map((e) => (
              <Link key={e.key} href={e.href} title={e.titulo} className={cn("rounded px-1.5 py-0.5", grande ? "whitespace-normal" : "truncate", e.clase)}>
                {grande && e.hora && <b className="font-semibold">{e.hora} </b>}{e.texto}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      <div className="mb-3.5 text-[13px] text-muted-foreground">
        <Link href="/planificacion" className="hover:text-foreground">Planificación</Link> / {mayus(MESES[mes - 1])} {anio}
      </div>
      <Cabecera titulo={`${mayus(MESES[mes - 1])} ${anio}`}>
        <Button variant="outline" size="icon" aria-label="Mes anterior" render={<Link href={`/planificacion?mes=${anterior}`} />}><ChevronLeft className="size-4" aria-hidden /></Button>
        <Button variant="outline" size="icon" aria-label="Mes siguiente" render={<Link href={`/planificacion?mes=${siguiente}`} />}><ChevronRight className="size-4" aria-hidden /></Button>
        <div role="group" aria-label="Vista" className="inline-flex overflow-hidden rounded-lg border text-sm">
          {(["mes", "semana"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)}
              className={cn("px-3 py-1.5 capitalize", vista === v ? "bg-foreground text-background" : "bg-card")}>{v}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 rounded-lg border bg-card px-3 text-sm">
          <Switch checked={verPendientes} onCheckedChange={setVerPendientes} />
          Pendientes
        </label>
      </Cabecera>

      <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span><Etiqueta className="bg-[#EEF4F7] text-[#2F5D70]">Montaje</Etiqueta></span>
        <span><Etiqueta className={CLASE_CONFIRMADO}>Evento confirmado</Etiqueta></span>
        <span><Etiqueta className={CLASE_SEGURO}>Evento con seguro</Etiqueta></span>
        <span><Etiqueta className="bg-[#F2F1EE] text-[#4B4B48]">Desmontaje</Etiqueta></span>
      </div>

      {vista === "semana" && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <Button variant="outline" size="icon-sm" aria-label="Semana anterior" disabled={semana === 0} onClick={() => setSemana(semana - 1)}><ChevronLeft className="size-4" aria-hidden /></Button>
          <span>Semana {semana + 1} de {semanas.length}</span>
          <Button variant="outline" size="icon-sm" aria-label="Semana siguiente" disabled={semana >= semanas.length - 1} onClick={() => setSemana(semana + 1)}><ChevronRight className="size-4" aria-hidden /></Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <div className="grid min-w-[720px] grid-cols-7 text-xs">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <div key={d} className="border-b px-2 py-2 font-medium text-muted-foreground">{d}</div>
          ))}
          {vista === "mes" ? dias.map((dia, i) => celda(dia, i, false)) : (semanas[semana] ?? []).map((dia, i) => celda(dia, i, true))}
        </div>
      </div>

      {sinDia.length > 0 && (
        <div className="mt-5">
          <h2 className="mb-2 text-sm font-semibold">Este mes, sin día cerrado</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sinDia.map((t) => <TarjetaEvento key={t.id} t={t} mes={m} />)}
          </div>
        </div>
      )}
    </>
  );
}
