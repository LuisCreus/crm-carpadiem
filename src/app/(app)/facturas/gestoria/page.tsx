import type { Metadata } from "next";
import { PantallaGestoria } from "./pantalla-gestoria";

export const metadata: Metadata = { title: "Gestoría" };

export default function GestoriaPage() {
  return <PantallaGestoria />;
}
