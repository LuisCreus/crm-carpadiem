import type { Metadata } from "next";
import { Proximamente } from "@/components/proximamente";

export const metadata: Metadata = { title: "Eventos" };

export default function Page() {
  return <Proximamente titulo="Eventos" fase={3} texto="Eventos creados al aceptar un presupuesto, con montaje y material." />;
}
