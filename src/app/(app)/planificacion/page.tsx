import type { Metadata } from "next";
import { Planificacion } from "./planificacion";

export const metadata: Metadata = { title: "Planificación" };

export default async function PlanificacionPage({ searchParams }: PageProps<"/planificacion">) {
  const { mes } = await searchParams;
  return <Planificacion mesDetalle={typeof mes === "string" && /^\d{4}-\d{2}$/.test(mes) ? mes : undefined} />;
}
