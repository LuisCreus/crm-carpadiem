import type { Metadata } from "next";
import { exigirFinanzas } from "@/lib/auth";
import { PantallaPyg } from "./pantalla-pyg";

export const metadata: Metadata = { title: "P&L" };

export default async function PygPage() {
  const usuario = await exigirFinanzas();
  return <PantallaPyg esAdmin={usuario.esAdmin} />;
}
