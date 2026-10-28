import type { Metadata } from "next";
import { ListaEventos } from "./lista-eventos";

export const metadata: Metadata = { title: "Eventos" };

export default function EventosPage() {
  return <ListaEventos />;
}
