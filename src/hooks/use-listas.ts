"use client";

import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import type { Comercial, IntermediarioCorto, Opcion } from "@/lib/datos/tipos";

type Listas = {
  comerciales: Comercial[];
  tiposCliente: Opcion[];
  tiposEvento: Opcion[];
  rolesContacto: Opcion[];
  canales: Opcion[];
  intermediarios: IntermediarioCorto[];
};

const VACIAS: Listas = { comerciales: [], tiposCliente: [], tiposEvento: [], rolesContacto: [], canales: [], intermediarios: [] };

// Listas editables (comerciales, tipos…) siempre al día
export function useListas() {
  const { datos } = useTablaEnVivo<Listas>(
    ["comerciales", "tipos_cliente", "tipos_evento", "roles_contacto", "canales_lead", "intermediarios"],
    async (sb) => {
      const activos = (tabla: string, campos: string) =>
        sb.from(tabla).select(campos).eq("activo", true).order("orden").order("nombre");
      const [c, tc, te, rc, ca, i] = await Promise.all([
        activos("comerciales", "id, nombre"),
        activos("tipos_cliente", "codigo, nombre, reserva_pct"),
        activos("tipos_evento", "codigo, nombre"),
        activos("roles_contacto", "codigo, nombre"),
        activos("canales_lead", "codigo, nombre"),
        sb.from("intermediarios").select("id, nombre, comision_pct").is("deleted_at", null).order("nombre"),
      ]);
      return [{
        comerciales: (c.data ?? []) as unknown as Comercial[],
        tiposCliente: (tc.data ?? []) as unknown as Opcion[],
        tiposEvento: (te.data ?? []) as unknown as Opcion[],
        rolesContacto: (rc.data ?? []) as unknown as Opcion[],
        canales: (ca.data ?? []) as unknown as Opcion[],
        intermediarios: (i.data ?? []) as unknown as IntermediarioCorto[],
      }];
    },
  );
  return datos[0] ?? VACIAS;
}

export function nombreDe(lista: Opcion[], codigo: string | null | undefined): string {
  if (!codigo) return "—";
  return lista.find((o) => o.codigo === codigo)?.nombre ?? codigo;
}
