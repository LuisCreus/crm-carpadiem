import { Cabecera } from "@/components/cabecera";
import { EstadoVacio } from "@/components/estado-vacio";

// Pantalla provisional para lo que se construye en fases posteriores
export function Proximamente({ titulo, fase, texto }: { titulo: string; fase: number; texto: string }) {
  return (
    <>
      <Cabecera titulo={titulo} />
      <EstadoVacio titulo={`Se construye en la Fase ${fase}`} texto={texto} />
    </>
  );
}
