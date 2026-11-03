import type { Metadata } from "next";
import { PantallaGestoria } from "./pantalla-gestoria";
// Generar documentos con Microsoft puede tardar: hasta 60 sexport const maxDuration = 60;

export const metadata: Metadata = { title: "Gestoría" };

export default function GestoriaPage() {
  return <PantallaGestoria />;
}
