import type { Metadata } from "next";
import { Cabecera } from "@/components/cabecera";
import { exigirAdmin } from "@/lib/auth";
import { AjustesAdmin } from "./ajustes-admin";

export const metadata: Metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  const admin = await exigirAdmin();
  return (
    <>
      <Cabecera titulo="Ajustes" subtitulo="Solo el administrador ve y cambia esta pantalla" />
      <AjustesAdmin miId={admin.id} />
    </>
  );
}
