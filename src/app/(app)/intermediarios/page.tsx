import type { Metadata } from "next";
import { ListaIntermediarios } from "./lista-intermediarios";

export const metadata: Metadata = { title: "Intermediarios" };

export default function IntermediariosPage() {
  return <ListaIntermediarios />;
}
