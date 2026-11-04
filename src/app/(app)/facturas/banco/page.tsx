import { exigirFinanzas } from "@/lib/auth";
import type { Metadata } from "next";
import { PantallaBanco } from "./pantalla-banco";

export const metadata: Metadata = { title: "Banco" };

export default async function BancoPage() {
  await exigirFinanzas();
  return <PantallaBanco />;
}
