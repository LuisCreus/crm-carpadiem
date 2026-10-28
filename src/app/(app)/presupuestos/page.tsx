import type { Metadata } from "next";
import { ListaPresupuestos } from "./lista-presupuestos";

export const metadata: Metadata = { title: "Presupuestos" };

export default function PresupuestosPage() {
  return <ListaPresupuestos />;
}
