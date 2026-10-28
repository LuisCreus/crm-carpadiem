import "server-only";

// Acceso a SharePoint con Microsoft Graph, como la aplicación "CRM Carpa Diem"
// (permiso Sites.Selected: solo el sitio GrupoGS). Todo cuelga de SP_RAIZ:
// durante las pruebas es "CARPA DIEM/00. CRM PRUEBAS"; en producción, "CARPA DIEM".

const GRAPH = "https://graph.microsoft.com/v1.0";

export class ErrorSharePoint extends Error {
  constructor(mensaje: string, public estado?: number) {
    super(mensaje);
  }
}

export function sharepointConfigurado(): boolean {
  return Boolean(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_TENANT_ID && process.env.AZURE_AD_CLIENT_SECRET);
}

const config = () => ({
  host: process.env.SP_HOST ?? "gilcasoundsl749.sharepoint.com",
  sitio: process.env.SP_SITIO ?? "/sites/GrupoGS",
  raiz: (process.env.SP_RAIZ ?? "CARPA DIEM/00. CRM PRUEBAS").replace(/\/+$/, ""),
  plantillas: process.env.SP_PLANTILLAS ?? "CARPA DIEM/00. CRM PRUEBAS/02. PLANTILLAS",
});

// Las rutas del CRM empiezan por "CARPA DIEM/…"; aquí se cuelgan de SP_RAIZ
export function rutaReal(ruta: string): string {
  const { raiz } = config();
  return ruta.startsWith("CARPA DIEM/") ? `${raiz}/${ruta.slice("CARPA DIEM/".length)}` : ruta;
}

export function rutaPlantilla(plantilla: "carpadiem" | "neutra"): string {
  const nombre = plantilla === "neutra" ? "PLANTILLA CRM NEUTRA _ CARPADIEM.docx" : "PLANTILLA CRM _ CARPADIEM.docx";
  return `${config().plantillas}/${nombre}`;
}

// ---------------------------------------------------------------------
// Token (credenciales de la aplicación), con caché en memoria
// ---------------------------------------------------------------------
let token: { valor: string; caduca: number } | null = null;

async function obtenerToken(): Promise<string> {
  if (token && token.caduca > Date.now() + 60_000) return token.valor;
  if (!sharepointConfigurado()) throw new ErrorSharePoint("Falta configurar Microsoft (AZURE_AD_* en .env.local)");
  const cuerpo = new URLSearchParams({
    client_id: process.env.AZURE_AD_CLIENT_ID!,
    client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const r = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    body: cuerpo,
  });
  const datos = await r.json();
  if (!r.ok) throw new ErrorSharePoint(`Microsoft no ha dado acceso: ${datos.error_description ?? datos.error}`, r.status);
  token = { valor: datos.access_token, caduca: Date.now() + datos.expires_in * 1000 };
  return token.valor;
}

async function graph(ruta: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(ruta.startsWith("http") ? ruta : `${GRAPH}${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${await obtenerToken()}`, ...(init.headers ?? {}) },
    redirect: "follow",
  });
  if (!r.ok && r.status !== 404) {
    let detalle = "";
    try { detalle = (await r.clone().json()).error?.message ?? ""; } catch { /* sin cuerpo */ }
    throw new ErrorSharePoint(`SharePoint respondió ${r.status}${detalle ? `: ${detalle}` : ""}`, r.status);
  }
  return r;
}

// ---------------------------------------------------------------------
// Sitio y biblioteca "Documentos compartidos"
// ---------------------------------------------------------------------
let drive: { id: string; webUrl: string } | null = null;

async function datosDrive() {
  if (drive) return drive;
  const { host, sitio } = config();
  const s = await (await graph(`/sites/${host}:${sitio}`)).json();
  const d = await (await graph(`/sites/${s.id}/drive`)).json();
  drive = { id: d.id as string, webUrl: d.webUrl as string };
  return drive;
}

async function obtenerDrive(): Promise<string> {
  return (await datosDrive()).id;
}

// Dirección directa del archivo (la que necesita Word de escritorio)
export async function urlDirecta(ruta: string): Promise<string> {
  return `${(await datosDrive()).webUrl}/${ruta.split("/").map(encodeURIComponent).join("/")}`;
}

const codificar = (ruta: string) => ruta.split("/").map(encodeURIComponent).join("/");

export type Elemento = {
  id: string;
  name: string;
  webUrl: string;
  lastModifiedDateTime: string;
  size?: number;
  folder?: unknown;
  parentReference?: { path?: string; id?: string };
};

export async function elementoPorRuta(ruta: string): Promise<Elemento | null> {
  const drive = await obtenerDrive();
  const r = await graph(`/drives/${drive}/root:/${codificar(ruta)}`);
  return r.status === 404 ? null : ((await r.json()) as Elemento);
}

export async function elementoPorId(id: string): Promise<Elemento | null> {
  const drive = await obtenerDrive();
  const r = await graph(`/drives/${drive}/items/${id}`);
  return r.status === 404 ? null : ((await r.json()) as Elemento);
}

// Crea la carpeta (y las que falten por encima) si no existe
export async function asegurarCarpeta(ruta: string): Promise<Elemento> {
  const existente = await elementoPorRuta(ruta);
  if (existente) return existente;
  const partes = ruta.split("/");
  const nombre = partes.pop()!;
  const padre = await asegurarCarpeta(partes.join("/"));
  const drive = await obtenerDrive();
  const r = await graph(`/drives/${drive}/items/${padre.id}/children`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nombre, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
  if (r.status === 404) throw new ErrorSharePoint(`No se pudo crear la carpeta ${ruta}`);
  return (await r.json()) as Elemento;
}

export async function descargar(id: string): Promise<Uint8Array> {
  const drive = await obtenerDrive();
  const r = await graph(`/drives/${drive}/items/${id}/content`);
  if (r.status === 404) throw new ErrorSharePoint("El archivo ya no está en SharePoint");
  return new Uint8Array(await r.arrayBuffer());
}

// Descarga convertido a PDF (Word → PDF lo hace Microsoft)
export async function descargarComoPdf(id: string): Promise<Uint8Array> {
  const drive = await obtenerDrive();
  const r = await graph(`/drives/${drive}/items/${id}/content?format=pdf`);
  if (r.status === 404) throw new ErrorSharePoint("El archivo ya no está en SharePoint");
  return new Uint8Array(await r.arrayBuffer());
}

// Sube (o sustituye) un archivo en la ruta indicada
export async function subir(ruta: string, contenido: Uint8Array, tipo: string): Promise<Elemento> {
  const drive = await obtenerDrive();
  const r = await graph(`/drives/${drive}/root:/${codificar(ruta)}:/content`, {
    method: "PUT",
    headers: { "Content-Type": tipo },
    body: contenido as unknown as BodyInit,
  });
  return (await r.json()) as Elemento;
}

// Mueve y/o renombra (carpetas o archivos)
export async function moverRenombrar(id: string, carpetaDestino: string | null, nombreNuevo: string): Promise<Elemento> {
  const drive = await obtenerDrive();
  const cuerpo: Record<string, unknown> = { name: nombreNuevo };
  if (carpetaDestino) cuerpo.parentReference = { id: (await asegurarCarpeta(carpetaDestino)).id };
  const r = await graph(`/drives/${drive}/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return (await r.json()) as Elemento;
}

export const TIPO_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const TIPO_PDF = "application/pdf";

// Enlace para abrir en Word de escritorio
export const enlaceWordEscritorio = (webUrl: string) => `ms-word:ofe|u|${webUrl}`;
