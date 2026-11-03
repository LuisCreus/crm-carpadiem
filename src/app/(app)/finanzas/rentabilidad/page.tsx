import type { Metadata } from "next";
import { ResumenRentabilidad } from "./resumen-rentabilidad";

export const metadata: Metadata = { title: "Rentabilidad" };

export default function RentabilidadPage() {
  return <ResumenRentabilidad />;
}
