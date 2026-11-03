import type { Metadata } from "next";
import { ListaRecibidas } from "./lista-recibidas";
// Generar documentos con Microsoft puede tardar: hasta 60 sexport const maxDuration = 60;

export const metadata: Metadata = { title: "Facturas recibidas" };

export default function RecibidasPage() {
  return <ListaRecibidas />;
}
