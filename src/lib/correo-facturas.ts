"use server";

// "Correo": prepara en Outlook un borrador con la factura en PDF adjunta.
// Lo revisas y lo envías tú desde Outlook; el CRM nunca envía solo.

import { obtenerUsuario } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { descargar } from "@/lib/graph/sharepoint";
import { correoConfigurado, crearBorrador } from "@/lib/graph/correo";

type Resultado = { ok: true; webLink: string } | { ok: false; error: string };

export async function estadoCorreo(): Promise<{ configurado: boolean; buzon: string | null }> {
  await obtenerUsuario();
  return { configurado: correoConfigurado(), buzon: process.env.CORREO_BUZON ?? null };
}

export async function prepararCorreoFactura(facturaId: string, correo: { para: string; asunto: string; texto: string }): Promise<Resultado> {
  try {
    await obtenerUsuario();
    const para = correo.para.split(/[;,\s]+/).map((x) => x.trim()).filter(Boolean);
    if (!para.length || para.some((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) throw new Error("Revisa el email del destinatario");
    const sb = await crearClienteServidor();
    const { data: f } = await sb.from("facturas").select("codigo, pdf_item_id, pdf_nombre").eq("id", facturaId).maybeSingle();
    if (!f?.codigo) throw new Error("Factura no encontrada o sin emitir");
    if (!f.pdf_item_id) throw new Error("La factura todavía no tiene PDF: pulsa “Generar PDF”");

    const pdf = await descargar(f.pdf_item_id);
    const borrador = await crearBorrador({
      para,
      asunto: correo.asunto.trim() || `Factura ${f.codigo} · Carpa Diem`,
      texto: correo.texto,
      adjuntos: [{ nombre: f.pdf_nombre ?? `FACTURA ${f.codigo}.pdf`, tipo: "application/pdf", contenido: pdf }],
    });
    await sb.from("facturas").update({ correo_preparado_at: new Date().toISOString(), correo_para: para.join(", ") }).eq("id", facturaId);
    return { ok: true, webLink: borrador.webLink };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido" };
  }
}
