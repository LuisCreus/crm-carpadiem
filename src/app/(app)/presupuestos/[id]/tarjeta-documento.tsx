"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, ExternalLink, FileText, FolderOpen, Link2, Share2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Etiqueta } from "@/components/etiqueta-estado";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { crearClienteNavegador } from "@/lib/supabase/client";
import {
  crearDocumento, crearVersionDocumento, enlaceEscritorio, estadoSharePoint, generarPdf, moverCarpeta,
} from "@/lib/documentos";
import type { Presupuesto, Version } from "@/lib/datos/tipos";
import { formatoEuros, formatoFecha, formatoPorcentaje } from "@/lib/formato";
import { importeReserva, nombreArchivoPresupuesto, rutaCarpetaCliente } from "@/lib/negocio";

const vv = (n: number) => `V${String(n).padStart(2, "0")}`;

type Confirmacion = { version: number; total: number | null; reservaPct: number | null };

export function TarjetaDocumento({ p, versiones }: { p: Presupuesto; versiones: Version[] }) {
  const sb = crearClienteNavegador();
  const [sp, setSp] = useState<{ configurado: boolean; raiz: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<Confirmacion | null>(null);
  const [esperarWord, setEsperarWord] = useState(false);
  const [importeTexto, setImporteTexto] = useState("");
  const subirRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    estadoSharePoint().then(setSp).catch(() => setSp({ configurado: false, raiz: "" }));
  }, []);

  const cliente = p.cliente?.nombre ?? "";
  const ultima = versiones[0];
  const conWord = versiones.find((v) => v.docx_item_id);
  const carpetaEsperada = rutaCarpetaCliente(p.fecha_precision, p.fecha_evento, cliente).replace(/^CARPA DIEM\//, "");
  const carpetaDesfasada = p.sp_carpeta_ruta && !p.sp_carpeta_ruta.endsWith(carpetaEsperada);

  async function ejecutar<T>(clave: string, fn: () => Promise<T>) {
    setOcupado(clave);
    try {
      return await fn();
    } finally {
      setOcupado(null);
    }
  }

  async function abrirEscritorio(v: Version) {
    if (!v.docx_ruta) return;
    window.location.href = await enlaceEscritorio(v.docx_ruta);
  }

  async function crearWord() {
    const r = await ejecutar("crear", () => crearDocumento(p.id));
    if (!r.ok) return toast.error(r.error);
    toast.success(`${r.nombre} creado ✓`);
    window.location.href = r.escritorio;
  }

  async function nuevaVersion() {
    if (!sp?.configurado || !conWord) {
      const { data, error } = await sb.rpc("nueva_version", { p_id: p.id });
      return error ? toast.error(error.message) : toast.success(`${vv(data as number)} creada ✓`);
    }
    const r = await ejecutar("version", () => crearVersionDocumento(p.id));
    if (!r.ok) return toast.error(r.error);
    toast.success(`${vv(r.version)} creada ✓ · abriendo Word…`);
    window.location.href = r.escritorio;
  }

  async function pdf(forzar = false) {
    setEsperarWord(false);
    const r = await ejecutar("pdf", () => generarPdf(p.id, forzar));
    if (!r.ok) return toast.error(r.error);
    if (r.esperar) return setEsperarWord(true);
    toast.success(`PDF de ${vv(r.version)} guardado en la carpeta ✓`);
    setImporteTexto(r.total !== null ? String(r.total).replace(".", ",") : "");
    setConfirmar(r);
  }

  async function guardarImporte(total: number, reservaPct: number | null, version: number) {
    const cambios: Record<string, number> = { importe: total };
    if (reservaPct !== null && reservaPct !== Number(p.reserva_pct)) cambios.reserva_pct = reservaPct;
    const r1 = await sb.from("presupuestos").update(cambios).eq("id", p.id);
    const r2 = await sb.from("presupuesto_versiones").update({ importe: total }).eq("presupuesto_id", p.id).eq("version", version);
    if (r1.error || r2.error) return toast.error((r1.error ?? r2.error)!.message);
    toast.success("Importe guardado ✓");
    setConfirmar(null);
  }

  async function mover() {
    if (!window.confirm(`La carpeta debería llamarse ahora:\n${carpetaEsperada}\n\n¿La muevo/renombro en SharePoint?`)) return;
    const r = await ejecutar("mover", () => moverCarpeta(p.id));
    if (!r.ok) toast.error(r.error);
    else toast.success("Carpeta movida ✓");
  }

  // Plan B: subir el PDF a mano (si SharePoint falla o no está configurado)
  async function subirPdf(archivo: File) {
    if (!ultima) return;
    if (archivo.type !== "application/pdf") return toast.error("Tiene que ser un PDF");
    await ejecutar("subir", async () => {
      const ruta = `${p.id}/${vv(ultima.version)}-${Date.now()}.pdf`;
      const { error } = await sb.storage.from("documentos").upload(ruta, archivo, { contentType: "application/pdf" });
      if (error) return toast.error(error.message);
      const { error: e2 } = await sb.from("presupuesto_versiones").update({
        pdf_storage: ruta,
        pdf_generado_at: new Date().toISOString(),
        nombre_archivo: ultima.nombre_archivo ?? nombreArchivoPresupuesto(p.numero, cliente, ultima.version, "docx"),
      }).eq("id", ultima.id);
      if (e2) return toast.error(e2.message);
      toast.success("PDF subido ✓ · escribe el importe con “Cambiar”");
    });
  }

  async function copiarEnlace(v: Version) {
    const enlace = v.pdf_url ?? `${window.location.origin}/api/pdf/${v.id}?ver=1`;
    await navigator.clipboard.writeText(enlace);
    toast.success("Enlace copiado ✓");
  }

  async function compartir(v: Version) {
    try {
      const r = await fetch(`/api/pdf/${v.id}`);
      if (!r.ok) throw new Error("No se pudo descargar el PDF");
      const nombre = (v.nombre_archivo ?? `presupuesto ${vv(v.version)}`).replace(/\.docx$/i, ".pdf");
      const archivo = new File([await r.blob()], nombre, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [archivo] })) await navigator.share({ files: [archivo], title: nombre });
      else window.open(`/api/pdf/${v.id}`, "_blank");
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") toast.error(e.message);
    }
  }

  const tienePdf = (v: Version) => Boolean(v.pdf_item_id || v.pdf_storage);
  const nombreUltima = nombreArchivoPresupuesto(p.numero, cliente, ultima?.version ?? 1, "docx").replace(/\.docx$/, "");

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-3.5 flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-semibold">Documento</h2>
        {p.sp_carpeta_url && (
          <a href={p.sp_carpeta_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px]">
            <FolderOpen className="size-4" aria-hidden /> Abrir carpeta
          </a>
        )}
      </div>

      {carpetaDesfasada && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#F3DFB8] bg-[#FDF3E1] p-3 text-[13px] text-[#5C3D07]">
          <span className="min-w-0 flex-1">Han cambiado la fecha o el cliente: la carpeta debería ser <b>{carpetaEsperada.split("/").pop()}</b>.</span>
          <Button size="sm" variant="outline" className="bg-card" disabled={ocupado !== null} onClick={mover}>Mover carpeta</Button>
        </div>
      )}

      <div className="flex items-center gap-3.5 rounded-lg border bg-background p-3.5">
        <div className="flex h-12 w-10 items-center justify-center rounded-md bg-[#EEF4F7] text-[#2F5D70]">
          <FileText className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{nombreUltima}</div>
          <div className="truncate text-[13px] text-muted-foreground">
            {conWord ? `Plantilla ${p.plantilla === "neutra" ? "neutra" : "Carpa Diem"}` : sp?.configurado ? "Todavía sin Word" : "SharePoint sin configurar · puedes subir el PDF a mano"}
          </div>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2">
        {sp?.configurado && !ultima?.docx_item_id && !conWord && (
          <Button disabled={ocupado !== null} onClick={crearWord}>{ocupado === "crear" ? "Creando Word…" : "Crear Word"}</Button>
        )}
        {ultima?.docx_item_id && (
          <>
            <Button onClick={() => abrirEscritorio(ultima)}>Abrir en Word</Button>
            {ultima.docx_url && (
              <Button variant="outline" render={<a href={ultima.docx_url} target="_blank" rel="noreferrer" />}>
                <ExternalLink className="size-4" aria-hidden /> Abrir en el navegador
              </Button>
            )}
            <Button variant="outline" disabled={ocupado !== null} onClick={() => pdf()}>{ocupado === "pdf" ? "Generando PDF…" : "Generar PDF"}</Button>
          </>
        )}
        <Button variant="outline" disabled={ocupado !== null} onClick={nuevaVersion}>
          {ocupado === "version" ? "Creando…" : `Crear ${vv((ultima?.version ?? 0) + 1)}`}
        </Button>
        <Button variant="ghost" disabled={ocupado !== null} onClick={() => subirRef.current?.click()}>
          <Upload className="size-4" aria-hidden /> {ocupado === "subir" ? "Subiendo…" : "Subir PDF a mano"}
        </Button>
        <input ref={subirRef} type="file" accept="application/pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirPdf(f); e.target.value = ""; }} />
      </div>

      <ul className="mt-4">
        {versiones.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2.5 text-sm">
            <span className="w-9 font-semibold">{vv(v.version)}</span>
            <span className="min-w-0 flex-1 text-muted-foreground">
              {v.pdf_generado_at ? `PDF ${formatoFecha(v.pdf_generado_at)}` : v.docx_item_id ? "Solo Word" : "Sin documento"}
              {v.enviado_at && ` · enviada ${formatoFecha(v.enviado_at)}`}
            </span>
            <span>{formatoEuros(v.importe !== null ? Number(v.importe) : null)}</span>
            {p.version_enviada === v.version && <Etiqueta className="bg-[#EEF4F7] text-[#2F5D70]">Enviada</Etiqueta>}
            {tienePdf(v) && (
              <span className="flex">
                <Button variant="ghost" size="icon-sm" aria-label={`Descargar PDF ${vv(v.version)}`} render={<a href={`/api/pdf/${v.id}`} />}>
                  <Download className="size-3.5" aria-hidden />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Copiar enlace del PDF ${vv(v.version)}`} onClick={() => copiarEnlace(v)}>
                  <Link2 className="size-3.5" aria-hidden />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Compartir PDF ${vv(v.version)}`} onClick={() => compartir(v)}>
                  <Share2 className="size-3.5" aria-hidden />
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={esperarWord} onOpenChange={setEsperarWord}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Espera a que Word termine de guardar</DialogTitle>
            <DialogDescription>
              El documento se ha modificado hace unos segundos. Si todavía lo tienes abierto, comprueba que pone “Guardado” y vuelve a intentarlo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => pdf(true)}>Generar igualmente</Button>
            <Button onClick={() => setEsperarWord(false)}>Esperar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmar !== null} onOpenChange={(a) => !a && setConfirmar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿El importe es correcto?</DialogTitle>
            <DialogDescription>
              {confirmar?.total !== null && confirmar
                ? `Importe ${formatoEuros(confirmar.total)}${confirmar.reservaPct !== null ? ` · Reserva ${formatoPorcentaje(confirmar.reservaPct)} = ${formatoEuros(importeReserva(confirmar.total, confirmar.reservaPct))}` : ""}`
                : "No he podido leer el “TOTAL (SIN IVA)” del documento. Escríbelo a mano."}
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5 text-sm">
            Total sin IVA (€)
            <Input inputMode="decimal" value={importeTexto} onChange={(e) => setImporteTexto(e.target.value)} />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(null)}>Ahora no</Button>
            <Button onClick={() => {
              const total = Number(importeTexto.replace(/\./g, "").replace(",", "."));
              if (!(total >= 0) || !confirmar) return toast.error("Importe no válido");
              void guardarImporte(total, confirmar.reservaPct, confirmar.version);
            }}>Sí, guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
