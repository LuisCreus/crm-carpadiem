import type { Metadata } from "next";
import { FichaPresupuesto } from "./ficha-presupuesto";
// Generar documentos con Microsoft puede tardar: hasta 60 sexport const maxDuration = 60;

export const metadata: Metadata = { title: "Presupuesto" };

export default async function PresupuestoPage({ params }: PageProps<"/presupuestos/[id]">) {
  const { id } = await params;
  return <FichaPresupuesto id={id} />;
}
