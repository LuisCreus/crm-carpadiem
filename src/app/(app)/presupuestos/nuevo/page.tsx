import type { Metadata } from "next";
import { obtenerUsuario } from "@/lib/auth";
import { FormularioPresupuesto } from "./formulario-presupuesto";

export const metadata: Metadata = { title: "Nuevo presupuesto" };

export default async function NuevoPresupuestoPage({ searchParams }: PageProps<"/presupuestos/nuevo">) {
  const usuario = await obtenerUsuario();
  const { lead, duplicar, opcion } = await searchParams;
  const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

  return (
    <FormularioPresupuesto
      nombreUsuario={usuario.nombre}
      leadId={texto(lead)}
      duplicarId={texto(duplicar)}
      opcionDeId={texto(opcion)}
    />
  );
}
