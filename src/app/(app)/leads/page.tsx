import type { Metadata } from "next";
import { obtenerUsuario } from "@/lib/auth";
import { TableroLeads } from "./tablero-leads";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage() {
  const usuario = await obtenerUsuario();
  return <TableroLeads nombreUsuario={usuario.nombre} />;
}
