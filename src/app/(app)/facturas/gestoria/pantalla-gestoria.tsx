"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Cabecera } from "@/components/cabecera";
import { Etiqueta } from "@/components/etiqueta-estado";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { claseSelect } from "@/components/campo";
import { formatoEuros, formatoFecha, hoyMadrid } from "@/lib/formato";
import { pasarTrimestre, verTrimestre, type FilaGestoria, type Trimestre, type Ubicacion } from "@/lib/gestoria";
import { trimestreDe } from "@/lib/rentabilidad";
import { PestanasFacturas } from "../pestanas";

const UBICACION: Record<Ubicacion, string> = {
  pendiente: "En PENDIENTE SARA",
  trimestre: "Ya en su trimestre",
  otra: "En otra carpeta",
  sin_archivo: "Sin PDF",
};

function Lista({ titulo, filas }: { titulo: string; filas: FilaGestoria[] }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[15px] font-semibold">{titulo} <span className="font-normal text-muted-foreground">· {filas.length}</span></h2>
      {filas.length === 0 ? <p className="text-sm text-muted-foreground">No hay facturas en este trimestre.</p> : (
        <ul className="divide-y rounded-xl border bg-card">
          {filas.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm md:px-5">
              <div className="min-w-0 flex-[1_1_240px]">
                <div className="font-medium">{f.nombre}</div>
                <div className="truncate text-[13px] text-muted-foreground">{formatoFecha(f.fecha)}{f.archivo && ` · ${f.archivo}`}</div>
              </div>
              <span className="text-[13px] text-muted-foreground">{UBICACION[f.ubicacion]}</span>
              {f.pasadaAt
                ? <Etiqueta className="bg-[#E8F4EC] text-[#25683D]">Pasada {formatoFecha(f.pasadaAt)}</Etiqueta>
                : <Etiqueta className="bg-[#FDF3E1] text-[#8A5A0B]">Por pasar</Etiqueta>}
              <span className="w-24 text-right font-medium">{formatoEuros(f.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Gestoría: facturas de cada trimestre (emitidas y recibidas) y el botón "Pasar a la gestoría"
export function PantallaGestoria() {
  const hoy = hoyMadrid();
  const [anio, setAnio] = useState(Number(hoy.slice(0, 4)));
  const [t, setT] = useState(trimestreDe(hoy));
  // Datos del trimestre cargado (clave año-trimestre-versión): si la clave no coincide, está cargando
  const [cargado, setCargado] = useState<{ clave: string; datos: Trimestre | null } | null>(null);
  const [version, setVersion] = useState(0);
  const clave = `${anio}-${t}-${version}`;
  const [confirmar, setConfirmar] = useState(false);
  const [pasando, setPasando] = useState(false);

  useEffect(() => {
    let vigente = true;
    verTrimestre(anio, t).then((r) => {
      if (!vigente) return;
      if (!r.ok) toast.error(r.error);
      setCargado({ clave, datos: r.ok ? r.datos : null });
    });
    return () => { vigente = false; };
  }, [anio, t, clave]);
  const cargando = cargado?.clave !== clave;
  const datos = cargando ? null : cargado.datos;

  const porPasar = datos?.filas.filter((f) => !f.pasadaAt) ?? [];
  const aMover = porPasar.filter((f) => f.ubicacion === "pendiente");

  async function pasar() {
    setPasando(true);
    const ventana = datos?.correo ? window.open("", "_blank") : null;
    const r = await pasarTrimestre(anio, t);
    setPasando(false);
    setConfirmar(false);
    if (!r.ok) {
      ventana?.close();
      return toast.error(r.error, { duration: 15000 });
    }
    if (ventana && r.borrador) ventana.location.href = r.borrador;
    else ventana?.close();
    toast.success(`${r.marcadas} facturas pasadas · ${r.movidos} PDF movidos a ${t} TRIMESTRE · Excel guardado${r.borrador ? " · borrador en Outlook" : ""}`, { duration: 12000 });
    setVersion((v) => v + 1);
  }

  return (
    <>
      <Cabecera titulo="Facturas" subtitulo="Lo que hay que pasar a la gestoría cada trimestre">
        <select aria-label="Trimestre" className={cn(claseSelect, "w-auto")} value={t} onChange={(e) => setT(Number(e.target.value))}>
          {[1, 2, 3, 4].map((x) => <option key={x} value={x}>{x}º trimestre</option>)}
        </select>
        <select aria-label="Año" className={cn(claseSelect, "w-auto")} value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
          {[anio - 1, anio, anio + 1].map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </Cabecera>
      <PestanasFacturas activa="gestoria" />

      {cargando && <p className="text-sm text-muted-foreground">Mirando las carpetas de SharePoint…</p>}
      {!cargando && datos && (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
            <div className="min-w-0 flex-1 text-sm">
              {porPasar.length
                ? <><b>{porPasar.length}</b> {porPasar.length === 1 ? "factura por pasar" : "facturas por pasar"} · {aMover.length} PDF en PENDIENTE SARA</>
                : "Todo este trimestre está pasado a la gestoría."}
            </div>
            <Button disabled={pasando} onClick={() => setConfirmar(true)}>{porPasar.length ? "Pasar a la gestoría" : "Volver a hacer el Excel"}</Button>
          </div>

          <Lista titulo="Emitidas" filas={datos.filas.filter((f) => f.tipo === "emitida")} />
          <Lista titulo="Recibidas" filas={datos.filas.filter((f) => f.tipo === "recibida")} />

          {datos.sueltos.length > 0 && (
            <section className="rounded-xl border border-dashed bg-card p-4 text-sm">
              <div className="mb-1 font-medium">Archivos de PENDIENTE SARA que no están en el CRM</div>
              <p className="mb-2 text-[13px] text-muted-foreground">No se mueven: muévelos a mano o apúntalos en el CRM (las recibidas, en Facturas → Recibidas).</p>
              <ul className="list-disc pl-5 text-[13px]">{datos.sueltos.map((s) => <li key={s}>{s}</li>)}</ul>
            </section>
          )}
        </>
      )}

      <Dialog open={confirmar} onOpenChange={(a) => !a && setConfirmar(false)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Pasar el {t}º trimestre de {anio} a la gestoría</DialogTitle>
            <DialogDescription>Revisa lo que va a hacer el CRM antes de continuar.</DialogDescription>
          </DialogHeader>
          <ol className="ml-5 list-decimal space-y-2 text-sm">
            <li>
              Mover {aMover.length} {aMover.length === 1 ? "PDF" : "PDF"} de <b>01. PENDIENTE SARA</b> a <b>{anio}/{t} TRIMESTRE</b>:
              {aMover.length > 0 && <ul className="mt-1 list-disc pl-5 text-[13px] text-muted-foreground">{aMover.map((f) => <li key={f.id}>{f.archivo}</li>)}</ul>}
            </li>
            <li>Marcar {porPasar.length} {porPasar.length === 1 ? "factura" : "facturas"} como pasadas a la gestoría.</li>
            <li>Guardar el Excel resumen del trimestre en {anio}/{t} TRIMESTRE.</li>
            <li>{datos?.correo ? `Preparar un borrador en Outlook ${datos.emailGestoria ? `para ${datos.emailGestoria}` : "(pon tú el destinatario)"} con el Excel adjunto.` : "El correo no está configurado: envía tú el Excel."}</li>
          </ol>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(false)}>Cancelar</Button>
            <Button disabled={pasando} onClick={pasar}>{pasando ? "Pasando…" : "Sí, pasar a la gestoría"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
