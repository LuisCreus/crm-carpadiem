import type { Metadata } from "next";
import { ListaFacturas } from "./lista-facturas";

export const metadata: Metadata = { title: "Facturas" };

export default function FacturasPage() {
  return <ListaFacturas />;
}
