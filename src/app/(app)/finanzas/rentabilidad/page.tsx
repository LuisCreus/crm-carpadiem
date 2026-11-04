import { exigirFinanzas } from "@/lib/auth";
import type { Metadata } from "next";
import { ResumenRentabilidad } from "./resumen-rentabilidad";

export const metadata: Metadata = { title: "Rentabilidad" };

export default async function RentabilidadPage() {
  await exigirFinanzas();
  return <ResumenRentabilidad />;
}
