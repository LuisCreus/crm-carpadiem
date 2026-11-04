import { exigirFinanzas } from "@/lib/auth";
import type { Metadata } from "next";
import { PantallaGestoria } from "./pantalla-gestoria";
// Generar documentos con Microsoft puede tardar: hasta 60 s
export const maxDuration = 60;

export const metadata: Metadata = { title: "Gestoría" };

export default async function GestoriaPage() {
  await exigirFinanzas();
  return <PantallaGestoria />;
}
