import type { Metadata } from "next";
import { Proximamente } from "@/components/proximamente";

export const metadata: Metadata = { title: "Inventario" };

export default function Page() {
  return <Proximamente titulo="Inventario" fase={5} texto="Material propio y subalquilado, y avisos de solapes." />;
}
