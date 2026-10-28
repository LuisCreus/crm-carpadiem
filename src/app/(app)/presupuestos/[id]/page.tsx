import type { Metadata } from "next";
import { FichaPresupuesto } from "./ficha-presupuesto";

export const metadata: Metadata = { title: "Presupuesto" };

export default async function PresupuestoPage({ params }: PageProps<"/presupuestos/[id]">) {
  const { id } = await params;
  return <FichaPresupuesto id={id} />;
}
