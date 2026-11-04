import "server-only";

// Hoja de montaje en PDF: diseño limpio, con logo y SIN precios.

import { PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { crearClienteServidor } from "@/lib/supabase/server";
import { LOGO_PNG_BASE64 } from "@/lib/logo-base64";
import { uno } from "@/lib/datos/tipos";
import { diaSemana, enlaceMaps, nombreHojaMontaje, textoFechaEvento, type PrecisionFecha } from "@/lib/negocio";
import { cantidadesDe, piezasParaMontar, textoCantidades, type FilaCantidades, type Recurso } from "@/lib/material";

export type DatosHoja = {
  numero: number | null;
  anio: number | null;
  codigo: string | null;
  cliente: string;
  tipoEvento: string | null;
  fechaPrecision: PrecisionFecha;
  fechaInicio: string | null;
  fechaFin: string | null;
  ubicacion: string | null;
  provincia: string | null;
  mapsUrl: string | null;
  contacto: { nombre: string; telefono: string | null } | null;
  montajeInicio: string | null;
  montajeFin: string | null;
  desmontajeInicio: string | null;
  desmontajeFin: string | null;
  material: string | null;
  materialReservado: { material: string; cantidad: number; unidad: string }[];
  // Lo que hay que cargar: el kit de cada carpa por las carpas del presupuesto
  resumenMaterial: string;
  piezas: { material: string; cantidad: number; grupo: string | null; falta: number }[];
  montadores: string[];
  observaciones: string | null;
  carpetaRuta: string | null;
};

type Supabase = Awaited<ReturnType<typeof crearClienteServidor>>;

export async function cargarDatosHoja(sb: Supabase, eventoId: string): Promise<DatosHoja | null> {
  const { data: e } = await sb
    .from("eventos")
    .select("*, cliente:clientes(nombre), presupuesto:presupuestos(numero, anio, codigo, sp_carpeta_ruta, uds_beduinas, uds_modulares, m2_tarima, uds_sombrillas, material), tipo:tipos_evento(nombre), contacto:contactos!eventos_contacto_destino_id_fkey(nombre, telefono)")
    .eq("id", eventoId)
    .maybeSingle();
  if (!e) return null;
  const [mo, mat, kit] = await Promise.all([
    sb.from("evento_montadores").select("montador:montadores(nombre)").eq("evento_id", eventoId),
    sb.from("evento_material").select("cantidad, inventario:inventario(material, unidad)").eq("evento_id", eventoId),
    sb.from("kit_material").select("recurso, por_unidad, inventario:inventario(id, material, cantidad, grupo, orden, deleted_at)"),
  ]);
  const cantidades = cantidadesDe(uno(e.presupuesto) as FilaCantidades | null, e.material);
  const piezasKit = (kit.data ?? [])
    .map((k) => ({ k, i: uno(k.inventario) as { id: string; material: string; cantidad: number; grupo: string | null; orden: number; deleted_at: string | null } | null }))
    .filter(({ i }) => i && !i.deleted_at)
    .sort((a, b) => a.i!.orden - b.i!.orden)
    .map(({ k, i }) => ({ recurso: k.recurso as Recurso, inventarioId: i!.id, material: i!.material, porUnidad: Number(k.por_unidad), stock: Number(i!.cantidad), grupo: i!.grupo }));
  const presupuesto = uno(e.presupuesto) as { numero: number; anio: number; codigo: string; sp_carpeta_ruta: string | null } | null;
  return {
    numero: presupuesto?.numero ?? null,
    anio: presupuesto?.anio ?? null,
    codigo: presupuesto?.codigo ?? null,
    cliente: (uno(e.cliente) as { nombre: string } | null)?.nombre ?? "",
    tipoEvento: (uno(e.tipo) as { nombre: string } | null)?.nombre ?? null,
    fechaPrecision: e.fecha_precision,
    fechaInicio: e.fecha_inicio,
    fechaFin: e.fecha_fin,
    ubicacion: e.ubicacion,
    provincia: e.provincia,
    mapsUrl: e.maps_url,
    contacto: uno(e.contacto) as DatosHoja["contacto"],
    montajeInicio: e.montaje_inicio,
    montajeFin: e.montaje_fin,
    desmontajeInicio: e.desmontaje_inicio,
    desmontajeFin: e.desmontaje_fin,
    material: e.material,
    materialReservado: (mat.data ?? []).map((m) => {
      const inv = uno(m.inventario) as { material: string; unidad: string } | null;
      return { material: inv?.material ?? "", cantidad: Number(m.cantidad), unidad: inv?.unidad ?? "" };
    }),
    resumenMaterial: textoCantidades(cantidades),
    piezas: piezasParaMontar(cantidades, piezasKit),
    montadores: (mo.data ?? []).map((m) => (uno(m.montador) as { nombre: string } | null)?.nombre ?? "").filter(Boolean),
    observaciones: e.observaciones_montaje,
    carpetaRuta: presupuesto?.sp_carpeta_ruta ?? null,
  };
}

export function nombreArchivoHoja(d: DatosHoja): string {
  return d.numero ? nombreHojaMontaje(d.numero, d.cliente, d.anio) : `HOJA DE MONTAJE ${d.cliente.toLocaleUpperCase("es-ES")}.pdf`;
}

// ---------------------------------------------------------------------
// Dibujo del PDF
// ---------------------------------------------------------------------

const CORAL = rgb(0.945, 0.31, 0.286);
const TEXTO = rgb(0.11, 0.11, 0.1);
const GRIS = rgb(0.42, 0.416, 0.4);
const LINEA = rgb(0.925, 0.92, 0.91);

const fechaHora = (iso: string | null) => {
  if (!iso) return null;
  return new Date(iso).toLocaleString("es-ES", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
  });
};
const horario = (inicio: string | null, fin: string | null) => {
  if (!inicio) return "Por definir";
  const desde = fechaHora(inicio)!;
  if (!fin) return desde;
  const dia = (x: string) => new Date(x).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const mismoDia = dia(inicio) === dia(fin);
  const hasta = mismoDia
    ? new Date(fin).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })
    : fechaHora(fin)!;
  return `${desde} – ${hasta}`;
};

// Quita los caracteres que la fuente estándar no puede escribir
function limpio(font: PDFFont, texto: string) {
  return [...texto.replace(/\r/g, "")].map((c) => {
    if (c === "\n") return c;
    try { font.encodeText(c); return c; } catch { return "?"; }
  }).join("");
}

function partirLineas(font: PDFFont, texto: string, tam: number, ancho: number): string[] {
  const salida: string[] = [];
  for (const parrafo of limpio(font, texto).split("\n")) {
    let linea = "";
    for (const palabra of parrafo.split(/\s+/)) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (font.widthOfTextAtSize(prueba, tam) > ancho && linea) {
        salida.push(linea);
        linea = palabra;
      } else linea = prueba;
    }
    salida.push(linea);
  }
  return salida;
}

export async function generarPdfHoja(d: DatosHoja): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(nombreArchivoHoja(d).replace(/\.pdf$/, ""));
  pdf.setAuthor("Carpa Diem");
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(Buffer.from(LOGO_PNG_BASE64, "base64"));

  const margen = 56;
  let pagina: PDFPage = pdf.addPage([595.28, 841.89]);
  const ancho = pagina.getWidth() - margen * 2;
  let y = pagina.getHeight() - margen;

  const nuevaPaginaSiHaceFalta = (alto: number) => {
    if (y - alto < margen + 30) {
      pagina = pdf.addPage([595.28, 841.89]);
      y = pagina.getHeight() - margen;
    }
  };

  // Cabecera: logo + título
  const anchoLogo = 120;
  const altoLogo = (logo.height / logo.width) * anchoLogo;
  pagina.drawImage(logo, { x: margen - 8, y: y - altoLogo + 10, width: anchoLogo, height: altoLogo });
  const titulo = "HOJA DE MONTAJE";
  pagina.drawText(titulo, { x: margen + ancho - negrita.widthOfTextAtSize(titulo, 16), y: y - 18, size: 16, font: negrita, color: TEXTO });
  if (d.codigo) {
    pagina.drawText(d.codigo, { x: margen + ancho - normal.widthOfTextAtSize(d.codigo, 11), y: y - 36, size: 11, font: normal, color: GRIS });
  }
  y -= Math.max(altoLogo, 50) + 14;
  pagina.drawLine({ start: { x: margen, y }, end: { x: margen + ancho, y }, thickness: 1.5, color: CORAL });
  y -= 26;

  // Cliente y fecha
  for (const linea of partirLineas(negrita, d.cliente, 20, ancho)) {
    pagina.drawText(linea, { x: margen, y, size: 20, font: negrita, color: TEXTO });
    y -= 24;
  }
  const fecha = textoFechaEvento(d.fechaPrecision, d.fechaInicio, d.fechaFin);
  const cuando = d.fechaPrecision === "dia" && d.fechaInicio ? `${diaSemana(d.fechaInicio)} ${fecha}` : fecha;
  pagina.drawText(limpio(normal, [d.tipoEvento, cuando].filter(Boolean).join(" · ")), { x: margen, y, size: 11, font: normal, color: GRIS });
  y -= 30;

  const seccion = (etiqueta: string, texto: string, enlace?: string) => {
    const lineas = partirLineas(normal, texto || "—", 11, ancho);
    nuevaPaginaSiHaceFalta(24 + lineas.length * 15);
    pagina.drawText(etiqueta.toUpperCase(), { x: margen, y, size: 8.5, font: negrita, color: CORAL });
    y -= 15;
    for (const l of lineas) {
      pagina.drawText(l, { x: margen, y, size: 11, font: normal, color: TEXTO });
      y -= 15;
    }
    if (enlace) {
      const texto2 = "Abrir en Google Maps";
      pagina.drawText(texto2, { x: margen, y, size: 10, font: normal, color: CORAL });
      const anotacion = pdf.context.register(pdf.context.obj({
        Type: "Annot", Subtype: "Link", Rect: [margen, y - 3, margen + normal.widthOfTextAtSize(texto2, 10), y + 10],
        Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(enlace) },
      }));
      pagina.node.set(PDFName.of("Annots"), pdf.context.obj([...(pagina.node.Annots()?.asArray() ?? []), anotacion]));
      y -= 15;
    }
    y -= 10;
    pagina.drawLine({ start: { x: margen, y: y + 4 }, end: { x: margen + ancho, y: y + 4 }, thickness: 0.6, color: LINEA });
    y -= 12;
  };

  const direccion = [d.ubicacion, d.provincia].filter(Boolean).join(", ");
  seccion("Dirección", direccion || "Por definir", direccion ? d.mapsUrl || enlaceMaps(direccion) : undefined);
  seccion("Contacto en destino", d.contacto ? [d.contacto.nombre, d.contacto.telefono].filter(Boolean).join(" · ") : "—");
  seccion("Montaje", horario(d.montajeInicio, d.montajeFin));
  seccion("Desmontaje", horario(d.desmontajeInicio, d.desmontajeFin));
  seccion("Montadores", d.montadores.join(", ") || "Por asignar");
  const materialReservado = d.materialReservado.map((m) => `· ${m.cantidad} ${m.unidad} ${m.material}`).join("\n");
  seccion("Material", [d.material, materialReservado].filter(Boolean).join("\n") || "—");
  // Material a cargar, pieza a pieza, con una casilla para marcar (lo prepara el almacén y lo comprueban los montadores)
  if (d.piezas.length) {
    nuevaPaginaSiHaceFalta(60);
    pagina.drawText("MATERIAL A CARGAR", { x: margen, y, size: 8.5, font: negrita, color: CORAL });
    pagina.drawText(limpio(normal, d.resumenMaterial), { x: margen + 110, y, size: 8.5, font: normal, color: GRIS });
    y -= 17;
    let grupoActual: string | null = "";
    for (const p of d.piezas) {
      if (p.grupo !== grupoActual) {
        grupoActual = p.grupo;
        nuevaPaginaSiHaceFalta(30);
        y -= 3;
        pagina.drawText(limpio(negrita, p.grupo ?? "Otros"), { x: margen, y, size: 9.5, font: negrita, color: TEXTO });
        y -= 14;
      }
      nuevaPaginaSiHaceFalta(16);
      pagina.drawRectangle({ x: margen, y: y - 1.5, width: 9, height: 9, borderColor: GRIS, borderWidth: 0.8 });
      const cantidad = String(p.cantidad);
      pagina.drawText(cantidad, { x: margen + 40 - negrita.widthOfTextAtSize(cantidad, 10.5), y, size: 10.5, font: negrita, color: TEXTO });
      pagina.drawText(limpio(normal, p.material), { x: margen + 50, y, size: 10.5, font: normal, color: TEXTO });
      if (p.falta > 0) {
        const aviso = `faltan ${p.falta}: alquilar`;
        pagina.drawText(aviso, { x: margen + ancho - normal.widthOfTextAtSize(aviso, 9.5), y, size: 9.5, font: normal, color: CORAL });
      }
      y -= 15;
    }
    y -= 8;
    pagina.drawLine({ start: { x: margen, y: y + 4 }, end: { x: margen + ancho, y: y + 4 }, thickness: 0.6, color: LINEA });
    y -= 12;
  }
  seccion("Observaciones", d.observaciones || "—");

  // Pie
  for (const p of pdf.getPages()) {
    const pie = "Carpa Diem · carpa-diem.com";
    p.drawText(pie, { x: margen, y: margen - 20, size: 8.5, font: normal, color: GRIS });
  }
  return pdf.save();
}
