import type { Metadata } from "next";
import { ListaProveedores } from "./lista-proveedores";

export const metadata: Metadata = { title: "Proveedores" };

export default function ProveedoresPage() {
  return <ListaProveedores />;
}
