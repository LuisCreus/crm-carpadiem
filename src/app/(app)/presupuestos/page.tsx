import type { Metadata } from "next";
import { Proximamente } from "@/components/proximamente";

export const metadata: Metadata = { title: "Presupuestos" };

export default function Page() {
  return <Proximamente titulo="Presupuestos" fase={3} texto="Nuevo presupuesto, duplicar, versiones, estados y cobros." />;
}
