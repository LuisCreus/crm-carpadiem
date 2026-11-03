import type { Metadata } from "next";
import { ListaRecibidas } from "./lista-recibidas";

export const metadata: Metadata = { title: "Facturas recibidas" };

export default function RecibidasPage() {
  return <ListaRecibidas />;
}
