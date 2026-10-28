import Link from "next/link";
import { Cabecera } from "@/components/cabecera";
import { EstadoVacio } from "@/components/estado-vacio";
import { Button } from "@/components/ui/button";
import { obtenerUsuario } from "@/lib/auth";
import { formatoFecha } from "@/lib/formato";

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
      <Cabecera titulo={`${saludo(ahora.getHours())}, ${nombre}`} subtitulo={formatoFecha(ahora)} />
      <EstadoVacio
        titulo="El Inicio se llena en la Fase 5"
        texto="Aquí verás los seguimientos, montajes, plazos de seguro y cobros de hoy y de esta semana. De momento puedes probar los intermediarios en tiempo real."
      >
        <Button render={<Link href="/intermediarios" />}>Ir a Intermediarios</Button>
      </EstadoVacio>
    </>
  );
}
