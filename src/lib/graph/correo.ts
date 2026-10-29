import "server-only";

// Correo con Microsoft Graph en el buzón de Carpa Diem (otro tenant: CarpaDiem).
// Registro propio "CRM Carpa Diem · Correo" con el permiso Mail.ReadWrite de aplicación.
// El CRM solo crea BORRADORES: el envío lo hace siempre la persona desde Outlook.

const GRAPH = "https://graph.microsoft.com/v1.0";

export function correoConfigurado(): boolean {
  return Boolean(process.env.CORREO_TENANT_ID && process.env.CORREO_CLIENT_ID && process.env.CORREO_CLIENT_SECRET && process.env.CORREO_BUZON);
}

let token: { valor: string; caduca: number } | null = null;

async function obtenerToken(): Promise<string> {
  if (token && token.caduca > Date.now() + 60_000) return token.valor;
  if (!correoConfigurado()) throw new Error("El correo todavía no está configurado en el CRM (CORREO_* en Vercel)");
  const r = await fetch(`https://login.microsoftonline.com/${process.env.CORREO_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.CORREO_CLIENT_ID!,
      client_secret: process.env.CORREO_CLIENT_SECRET!.trim(),
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const datos = await r.json();
  if (!r.ok) throw new Error(`Microsoft no ha dado acceso al correo: ${datos.error_description ?? datos.error}`);
  token = { valor: datos.access_token, caduca: Date.now() + datos.expires_in * 1000 };
  return token.valor;
}

export type Borrador = {
  para: string[];
  asunto: string;
  texto: string; // texto plano; los saltos de línea se respetan
  adjuntos: { nombre: string; tipo: string; contenido: Uint8Array }[];
};

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Crea el borrador en "Borradores" del buzón y devuelve el enlace para abrirlo en Outlook
export async function crearBorrador(b: Borrador): Promise<{ id: string; webLink: string }> {
  const buzon = encodeURIComponent(process.env.CORREO_BUZON!);
  const r = await fetch(`${GRAPH}/users/${buzon}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await obtenerToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: b.asunto,
      body: { contentType: "HTML", content: `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${escapar(b.texto).replace(/\n/g, "<br>")}</div>` },
      toRecipients: b.para.map((address) => ({ emailAddress: { address } })),
      attachments: b.adjuntos.map((a) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: a.nombre,
        contentType: a.tipo,
        contentBytes: Buffer.from(a.contenido).toString("base64"),
      })),
    }),
  });
  const datos = await r.json();
  if (!r.ok) throw new Error(`Outlook no ha creado el borrador: ${datos.error?.message ?? r.status}`);
  return { id: datos.id, webLink: datos.webLink };
}
