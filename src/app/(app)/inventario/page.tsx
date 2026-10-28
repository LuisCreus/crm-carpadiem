import type { Metadata } from "next";
import { TablaInventario } from "./tabla-inventario";

export const metadata: Metadata = { title: "Inventario" };

export default function InventarioPage() {
  return <TablaInventario />;
}
