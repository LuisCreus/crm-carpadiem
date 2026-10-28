"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { Etiqueta, CLASE_CONFIRMADO, CLASE_SEGURO } from "@/components/etiqueta-estado";
import { Button } from "@/components/ui/button";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { nombreDe, useListas } from "@/hooks/use-listas";
import { uno } from "@/lib/datos/tipos";
import { formatoEuros, formatoFecha } from "@/lib/formato";
import { MESES, type EstadoPresupuesto, type PrecisionFecha } from "@/lib/negocio";
import { calcularAvisos, numerosPeriodo, reservas, type Aviso, type TipoAviso } from "@/lib/operativa";
import { cn } from "@/lib/utils";

const TIPOS: Record<TipoAviso, { texto: string; clase: string }> = {
  seguimiento: { texto: "Seguimiento", clase: "bg-[#EEF4F7] text-[#2F5D70]" },
  accion_lead: { texto: "Lead", clase: "bg-[#EEF4F7] text-[#2F5D70]" },
  montaje: { texto: "Montaje", clase: "bg-[#FDEDEC] text-[#B0302A]" },
  desmontaje: { texto: "Desmontaje", clase: "bg-[#F2F1EE] text-[#4B4B48]" },
  seguro: { texto: "Seguro de lluvia", clase: "bg-[#FDF3E1] text-[#8A5A0B]" },
  cobro: { texto: "Cobro", clase: "bg-[#F2F1EE] text-[#4B4B48]" },
};

type Datos = {
  avisos: Aviso[];
  proximos: { id: string; cliente: string; tipo: string | null; material: string | null; lugar: string; fecha: string; precision: PrecisionFecha; modalidad: "confirmado" | "seguro" }[];
  presupuestos: { estado: EstadoPresupuesto; enviado_at: string | null; importe: number | null; reserva_pct: number | null; cobrado: number }[];
  telefonos: Record<string, { tel: string | null; email: string | null }>;
};

export function Inicio() {
  const listas = useListas();
  const hoy = new Date().toISOString().slice(0, 10);
  const [periodo, setPeriodo] = useState<"mes" | "anio">("mes");

  const { datos, cargando } = useTablaEnVivo<Datos>(
    ["presupuestos", "eventos", "cobros", "leads", "clientes", "ajustes"],
    async (sb) => {
      const [pr, ev, co, le, aj] = await Promise.all([
        sb.from("presupuestos").select("id, codigo, estado, enviado_at, importe, reserva_pct, cliente_id, cliente:clientes(nombre)").is("deleted_at", null),
        sb.from("eventos").select("id, presupuesto_id, cliente_id, estado, modalidad, fecha_precision, fecha_inicio, fecha_fin, montaje_inicio, desmontaje_inicio, importe, ubicacion, provincia, material, tipo_evento, cliente:clientes(nombre)")
          .is("deleted_at", null),
        sb.from("cobros").select("presupuesto_id, importe").is("deleted_at", null),
        sb.from("leads").select("id, cliente_nombre, estado, proxima_accion_fecha, proxima_accion_texto").is("deleted_at", null),
        sb.from("ajustes").select("dias_seguimiento, dias_limite_seguro, dias_aviso_seguro").maybeSingle(),
      ]);
      const cobrado = new Map<string, number>();
      for (const c of co.data ?? []) cobrado.set(c.presupuesto_id, (cobrado.get(c.presupuesto_id) ?? 0) + Number(c.importe));
      const presupuestos = (pr.data ?? []).map((p) => ({
        ...p, importe: p.importe !== null ? Number(p.importe) : null, reserva_pct: p.reserva_pct !== null ? Number(p.reserva_pct) : null,
        cobrado: cobrado.get(p.id) ?? 0, cliente: uno(p.cliente)?.nombre ?? "",
      }));
      const eventos = (ev.data ?? []).map((e) => ({
        ...e, cliente: uno(e.cliente)?.nombre ?? "", importe: e.importe !== null ? Number(e.importe) : null,
        cobrado: e.presupuesto_id ? cobrado.get(e.presupuesto_id) ?? 0 : 0,
      }));
      const avisos = calcularAvisos(hoy, { presupuestos, eventos, leads: le.data ?? [] }, {
        diasSeguimiento: aj.data?.dias_seguimiento ?? 7, diasLimiteSeguro: aj.data?.dias_limite_seguro ?? 10, diasAvisoSeguro: aj.data?.dias_aviso_seguro ?? 3,
      });
      const proximos = eventos
        .filter((e) => e.estado === "activo" && e.fecha_inicio && (e.fecha_fin ?? e.fecha_inicio) >= hoy)
        .sort((a, b) => a.fecha_inicio!.localeCompare(b.fecha_inicio!))
        .slice(0, 6)
        .map((e) => ({
          id: e.id, cliente: e.cliente, tipo: e.tipo_evento, material: e.material, fecha: e.fecha_inicio!, precision: e.fecha_precision,
          lugar: [e.ubicacion, e.provincia].filter(Boolean).join(", "), modalidad: e.modalidad,
        }));
      // Teléfono y email para llamar o escribir desde el aviso
      const clientes = [...new Set([...presupuestos.map((p) => p.cliente_id), ...eventos.map((e) => e.cliente_id)])];
      const { data: contactos } = clientes.length
        ? await sb.from("contactos").select("cliente_id, telefono, email").in("cliente_id", clientes).is("deleted_at", null).order("orden")
        : { data: [] };
      const porCliente: Record<string, { tel: string | null; email: string | null }> = {};
      for (const c of contactos ?? []) porCliente[c.cliente_id] ??= { tel: c.telefono, email: c.email };
      const telefonos: Datos["telefonos"] = {};
      for (const p of presupuestos) telefonos[`/presupuestos/${p.id}`] = porCliente[p.cliente_id];
      for (const e of eventos) telefonos[`/eventos/${e.id}`] = porCliente[e.cliente_id];
      return [{ avisos, proximos, presupuestos, telefonos }];
    },
  );

  const d = datos[0];
  const clave = periodo === "mes" ? hoy.slice(0, 7) : hoy.slice(0, 4);
  const numeros = d ? numerosPeriodo(d.presupuestos, clave) : null;
  const res = d ? reservas(d.presupuestos) : null;
  const nombreMes = MESES[Number(hoy.slice(5, 7)) - 1];

  return (
    <div className="grid gap-6">
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <section className="rounded-xl border bg-card py-2" aria-labelledby="h-hoy">
          <h2 id="h-hoy" className="mx-5 mt-3 mb-2 text-[15px] font-semibold">
            Hoy y esta semana {d && d.avisos.length > 0 && <span className="ml-1 text-muted-foreground">({d.avisos.length})</span>}
          </h2>
          {cargando && <p className="px-5 py-4 text-sm text-muted-foreground">Cargando…</p>}
          {d && d.avisos.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Nada pendiente. ✓</p>}
          <ul>
            {d?.avisos.map((a, i) => {
              const contacto = d.telefonos[a.href];
              return (
                <li key={i} className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t px-5 py-3">
                  <Etiqueta className={TIPOS[a.tipo].clase}>{TIPOS[a.tipo].texto}</Etiqueta>
                  <Link href={a.href} className="min-w-0 flex-1 basis-48">
                    <div className="text-sm font-medium text-foreground">{a.titulo}</div>
                    <div className="text-[13px] text-muted-foreground">{a.detalle}</div>
                  </Link>
                  <span className={cn("text-[13px] whitespace-nowrap", a.urgente ? "font-medium text-[#B0302A]" : "text-muted-foreground")}>
                    {a.fecha === hoy ? "Hoy" : formatoFecha(a.fecha)}
                  </span>
                  <span className="flex">
                    {contacto?.tel && <Button variant="ghost" size="icon-sm" aria-label={`Llamar a ${a.titulo}`} render={<a href={`tel:${contacto.tel}`} />}><Phone className="size-3.5" aria-hidden /></Button>}
                    {contacto?.email && <Button variant="ghost" size="icon-sm" aria-label={`Escribir a ${a.titulo}`} render={<a href={`mailto:${contacto.email}`} />}><Mail className="size-3.5" aria-hidden /></Button>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-xl border bg-card py-2" aria-labelledby="h-prox">
          <div className="mx-5 mt-3 mb-2 flex items-baseline">
            <h2 id="h-prox" className="flex-1 text-[15px] font-semibold">Próximos eventos</h2>
            <Link href="/planificacion" className="text-[13px]">Ver planificación</Link>
          </div>
          {d && d.proximos.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">No hay eventos próximos.</p>}
          <ul>
            {d?.proximos.map((e) => {
              const [, mes, dia] = e.fecha.split("-");
              return (
                <li key={e.id}>
                  <Link href={`/eventos/${e.id}`} className="flex items-center gap-4 border-t px-5 py-3 hover:bg-muted/40">
                    <div className="w-11 shrink-0 text-center">
                      <div className="text-xl leading-none font-semibold">{e.precision === "dia" ? dia : "—"}</div>
                      <div className="mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">{MESES[Number(mes) - 1].slice(0, 3)}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{e.cliente} <span className="font-normal text-muted-foreground">· {nombreDe(listas.tiposEvento, e.tipo)}</span></div>
                      <div className="truncate text-[13px] text-muted-foreground">{[e.material, e.lugar].filter(Boolean).join(" · ")}</div>
                    </div>
                    <Etiqueta className={e.modalidad === "seguro" ? CLASE_SEGURO : CLASE_CONFIRMADO}>{e.modalidad === "seguro" ? "Seguro" : "Confirmado"}</Etiqueta>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section aria-labelledby="h-num">
        <div className="mb-3.5 flex items-center gap-3">
          <h2 id="h-num" className="text-[15px] font-semibold">Números</h2>
          <div role="group" aria-label="Periodo" className="inline-flex overflow-hidden rounded-lg border text-[13px]">
            {([["mes", nombreMes], ["anio", hoy.slice(0, 4)]] as const).map(([v, t]) => (
              <button key={v} type="button" aria-pressed={periodo === v} onClick={() => setPeriodo(v)}
                className={cn("px-3 py-1 capitalize", periodo === v ? "bg-foreground text-background" : "bg-card")}>{t}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {numeros && res && [
            { label: "Presupuestos enviados", valor: String(numeros.enviados), sub: `${numeros.aceptados} aceptados`, barra: null },
            { label: "Tasa de aceptación", valor: numeros.tasaAceptacion === null ? "—" : `${Math.round(numeros.tasaAceptacion * 100)} %`, sub: `${numeros.aceptados} de ${numeros.enviados}`, barra: numeros.tasaAceptacion },
            { label: "€ aceptados", valor: formatoEuros(numeros.aceptado), sub: `de ${formatoEuros(numeros.presupuestado)} presupuestados`, barra: numeros.presupuestado ? numeros.aceptado / numeros.presupuestado : null },
            { label: "Reservas cobradas", valor: formatoEuros(res.cobradas), sub: `${formatoEuros(res.pendientes)} pendientes`, barra: res.cobradas + res.pendientes ? res.cobradas / (res.cobradas + res.pendientes) : null },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border bg-card p-4">
              <div className="text-[13px] text-muted-foreground">{k.label}</div>
              <div className="mt-1.5 text-2xl font-semibold tracking-tight">{k.valor}</div>
              <div className="mt-0.5 text-[13px] text-muted-foreground">{k.sub}</div>
              {k.barra !== null && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(k.barra * 100, 100)}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Sobre los presupuestos enviados en el periodo. Las reservas, de todos los aceptados.</p>
      </section>
    </div>
  );
}
