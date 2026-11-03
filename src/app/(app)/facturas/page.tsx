import type { Metadata } from "next";
import { ListaFacturas } from "./lista-facturas";
// Generar documentos con Microsoft puede tardar: hasta 60 sexport const maxDuration = 60;

export const metadata: Metadata = { title: "Facturas" };

export default function FacturasPage() {
  return <ListaFacturas />;
}
