import type { Metadata } from "next";
import { FichaEvento } from "./ficha-evento";
// Generar documentos con Microsoft puede tardar: hasta 60 sexport const maxDuration = 60;

export const metadata: Metadata = { title: "Evento" };

export default async function EventoPage({ params }: PageProps<"/eventos/[id]">) {
  const { id } = await params;
  return <FichaEvento id={id} />;
}
