import type { Metadata } from "next";
import { Proximamente } from "@/components/proximamente";

export const metadata: Metadata = { title: "Planificación" };

export default function Page() {
  return <Proximamente titulo="Planificación" fase={3} texto="Los 12 meses del año con los eventos cerrados y los presupuestos pendientes." />;
}
