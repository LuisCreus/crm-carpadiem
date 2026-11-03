import type { Metadata } from "next";
import { PantallaBanco } from "./pantalla-banco";

export const metadata: Metadata = { title: "Banco" };

export default function BancoPage() {
  return <PantallaBanco />;
}
