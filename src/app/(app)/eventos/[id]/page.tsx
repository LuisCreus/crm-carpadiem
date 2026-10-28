import type { Metadata } from "next";
import { FichaEvento } from "./ficha-evento";

export const metadata: Metadata = { title: "Evento" };

export default async function EventoPage({ params }: PageProps<"/eventos/[id]">) {
  const { id } = await params;
  return <FichaEvento id={id} />;
}
