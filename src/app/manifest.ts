import type { MetadataRoute } from "next";

// Manifiesto de la PWA: así el CRM se instala en la pantalla de inicio del móvil
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Carpa Diem CRM",
    short_name: "Carpa Diem",
    description: "CRM de CARPADIEM IBÉRICA S.L.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FBFBFA",
    theme_color: "#FBFBFA",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Lead rápido", url: "/leads?nuevo=1" },
      { name: "Planificación", url: "/planificacion" },
      { name: "Nuevo presupuesto", url: "/presupuestos/nuevo" },
    ],
  };
}
