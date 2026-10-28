import Link from "next/link";
import { Cabecera } from "@/components/cabecera";
import { Button } from "@/components/ui/button";
import { obtenerUsuario } from "@/lib/auth";
import { formatoFecha } from "@/lib/formato";
import { Inicio } from "./inicio";

function saludo(hora: number) {
  if (hora < 14) return "Buenos días";
  if (hora < 21) return "Buenas tardes";
  return "Buenas noches";
}

export default async function InicioPage() {
  const usuario = await obtenerUsuario();
  const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
  const nombre = usuario.nombre.split(" ")[0];

  return (
    <>
      <Cabecera titulo={`${saludo(ahora.getHours())}, ${nombre}`} subtitulo={formatoFecha(ahora)}>
        <Button variant="outline" render={<Link href="/leads?nuevo=1" />}>+ Lead rápido</Button>
        <Button render={<Link href="/presupuestos/nuevo" />}>+ Nuevo presupuesto</Button>
      </Cabecera>
      <Inicio />
    </>
  );
}
