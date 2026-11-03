import type { Metadata } from "next";
import { obtenerUsuario } from "@/lib/auth";
import { PantallaPyg } from "./pantalla-pyg";

export const metadata: Metadata = { title: "P&L" };

export default async function PygPage() {
  const usuario = await obtenerUsuario();
  return <PantallaPyg esAdmin={usuario.esAdmin} />;
}
