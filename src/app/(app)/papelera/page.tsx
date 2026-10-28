import type { Metadata } from "next";
import { Cabecera } from "@/components/cabecera";
import { exigirAdmin } from "@/lib/auth";
import { ListaPapelera } from "./lista-papelera";

export const metadata: Metadata = { title: "Papelera" };

export default async function PapeleraPage() {
  await exigirAdmin();
  return (
    <>
      <Cabecera titulo="Papelera" subtitulo="Lo que borra el equipo. Puedes restaurarlo o borrarlo para siempre." />
      <ListaPapelera />
    </>
  );
}
