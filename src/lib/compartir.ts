"use client";

import { toast } from "sonner";

// Compartir un PDF con el menú del móvil (WhatsApp, email…).
// En el iPhone, compartir tiene que ocurrir justo después del toque: si el PDF tarda en
// generarse, Safari lo bloquea. Entonces se guarda el PDF ya descargado y basta con
// volver a pulsar «Compartir» (la segunda vez es instantáneo).
const preparados = new Map<string, File>();

export async function compartirPdf(url: string, nombre: string) {
  try {
    let archivo = preparados.get(url);
    if (!archivo) {
      const r = await fetch(url);
      if (!r.ok) throw new Error("No se pudo descargar el PDF");
      // El nombre que manda el servidor (p. ej. "HOJA DE MONTAJE CD 078 …pdf"), o el indicado
      const delServidor = r.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''(.+)$/)?.[1];
      archivo = new File([await r.blob()], delServidor ? decodeURIComponent(delServidor) : nombre, { type: "application/pdf" });
    }
    if (!navigator.canShare?.({ files: [archivo] })) {
      // Ordenador o navegador sin "compartir": se abre el PDF en la misma pestaña
      window.location.assign(new URL(`${url}${url.includes("?") ? "&" : "?"}ver=1`, window.location.origin).href);
      return;
    }
    try {
      await navigator.share({ files: [archivo], title: archivo.name });
      preparados.delete(url);
    } catch (e) {
      if (e instanceof Error && e.name === "NotAllowedError") {
        preparados.set(url, archivo);
        toast.info("PDF preparado: pulsa otra vez «Compartir»", { duration: 8000 });
      } else if (!(e instanceof Error && e.name === "AbortError")) {
        throw e;
      }
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "No se pudo compartir");
  }
}
