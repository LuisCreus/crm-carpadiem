import type { Metadata } from "next";
import { ListaProveedores } from "./lista-proveedores";

export const metadata: Metadata = { title: "Contactos · Proveedores" };

export default function ProveedoresPage() {
  return <ListaProveedores />;
}
