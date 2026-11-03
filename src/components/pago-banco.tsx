"use client";

// Pagar a proveedores con el Santander: se eligen las facturas, se descarga el fichero SEPA,
// se sube a Santander Empresas y se firma una vez. Después se marcan como pagadas.

import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Campo } from "@/components/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { FacturaRecibida } from "@/lib/datos/tipos";
import { formatoEuros, hoyMadrid } from "@/lib/formato";
import { ficheroSepa, nombreFicheroSepa, problemaTransferencia, type Transferencia } from "@/lib/sepa";

// Siguiente día laborable (los bancos no ejecutan en fin de semana)
function siguienteLaborable(hoy: string): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

export function DialogoPagoBanco({ facturas, cerrar, alTerminar }: { facturas: FacturaRecibida[]; cerrar: () => void; alTerminar: () => void }) {
  const [fecha, setFecha] = useState(siguienteLaborable(hoyMadrid()));
  const [paso, setPaso] = useState<"revisar" | "subir">("revisar");
  const [ocupado, setOcupado] = useState(false);

  const transferencias = facturas.map((f) => {
    const t: Transferencia = { id: f.id, beneficiario: f.proveedor?.nombre ?? "", iban: f.iban ?? "", importe: f.total, concepto: f.concepto ?? (f.numero ? `Pago factura ${f.numero}` : "Pago factura") };
    return { ...t, problema: problemaTransferencia(t), yaEnFichero: Boolean(f.fichero_pago_at) };
  });
  const buenas = transferencias.filter((t) => !t.problema);
  const total = buenas.reduce((s, t) => s + t.importe, 0);

  async function descargar() {
    setOcupado(true);
    try {
      const xml = ficheroSepa({ transferencias: buenas, fechaEjecucion: fecha, creado: new Date() });
      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
      enlace.download = nombreFicheroSepa(fecha, buenas.length);
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000);
      const { error } = await crearClienteNavegador().from("facturas_recibidas")
        .update({ fichero_pago_at: new Date().toISOString() }).in("id", buenas.map((t) => t.id));
      if (error) throw new Error(error.message);
      setPaso("subir");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el fichero");
    } finally {
      setOcupado(false);
    }
  }

  async function marcarPagadas() {
    setOcupado(true);
    const { error } = await crearClienteNavegador().from("facturas_recibidas")
      .update({ estado: "pagada", fecha_pago: fecha }).in("id", buenas.map((t) => t.id));
    setOcupado(false);
    if (error) return toast.error(error.message);
    toast.success(`${buenas.length} ${buenas.length === 1 ? "factura pagada" : "facturas pagadas"} ✓`);
    alTerminar();
  }

  return (
    <Dialog open onOpenChange={(a) => !a && cerrar()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        {paso === "revisar" ? (
          <>
            <DialogHeader>
              <DialogTitle>Pagar con el Santander</DialogTitle>
              <DialogDescription>Se genera un fichero con todas las transferencias. Lo subes a Santander Empresas y lo firmas una sola vez.</DialogDescription>
            </DialogHeader>
            <ul className="divide-y rounded-lg border text-sm">
              {transferencias.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{t.beneficiario || "Sin proveedor"}</div>
                    <div className={t.problema ? "text-[13px] text-destructive" : "text-[13px] text-muted-foreground"}>
                      {t.problema ? `${t.problema}: no va en el fichero (corrígelo con Editar)` : `${t.iban} · “${t.concepto}”`}
                      {!t.problema && t.yaEnFichero && <span className="block text-[#B0302A]">Ojo: ya iba en un fichero anterior. Comprueba en el banco que no se pagó.</span>}
                    </div>
                  </div>
                  <span className={t.problema ? "text-muted-foreground line-through" : "font-medium"}>{formatoEuros(t.importe)}</span>
                </li>
              ))}
            </ul>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo id="pb-fecha" etiqueta="Fecha en que se hacen las transferencias">
                <Input id="pb-fecha" type="date" min={hoyMadrid()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </Campo>
              <div className="self-end rounded-lg border bg-background p-3 text-sm">
                {buenas.length} {buenas.length === 1 ? "transferencia" : "transferencias"} · <b>{formatoEuros(total)}</b>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={cerrar}>Cancelar</Button>
              <Button disabled={ocupado || !buenas.length || !fecha} onClick={descargar}>
                <Download className="size-4" aria-hidden /> Descargar el fichero
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Ahora, en Santander Empresas</DialogTitle>
              <DialogDescription>El fichero está en tu carpeta de Descargas: {nombreFicheroSepa(fecha, buenas.length)}</DialogDescription>
            </DialogHeader>
            <ol className="ml-5 list-decimal space-y-1.5 text-sm">
              <li>Entra en <b>Santander Empresas</b>.</li>
              <li>Ve a <b>Pagos → Transferencias → Envío de ficheros</b> (o <b>Ficheros → Enviar fichero</b>) y elige el formato <b>SEPA XML</b>.</li>
              <li>Sube el fichero, comprueba que salen {buenas.length} transferencias por {formatoEuros(total)} y <b>fírmalo</b>.</li>
              <li>Vuelve aquí y pulsa <b>“Ya lo he firmado”</b> para marcarlas como pagadas.</li>
            </ol>
            <p className="text-[13px] text-muted-foreground">Si todavía no lo vas a firmar, cierra esta ventana: las facturas quedan marcadas “En fichero” para no pagarlas dos veces.</p>
            <DialogFooter>
              <Button variant="outline" onClick={alTerminar}>Lo firmo luego</Button>
              <Button disabled={ocupado} onClick={marcarPagadas}>Ya lo he firmado: marcar pagadas</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
