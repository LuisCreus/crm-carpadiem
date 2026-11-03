"use client";

import { useCompartido } from "@/hooks/use-compartido";
import type { Comercial, IntermediarioCorto, Opcion } from "@/lib/datos/tipos";

type Listas = {
  comerciales: Comercial[];
  tiposCliente: Opcion[];
  tiposEvento: Opcion[];
  rolesContacto: Opcion[];
  canales: Opcion[];
  intermediarios: IntermediarioCorto[];
  montadores: Comercial[];
  categoriasGasto: Opcion[];
};

const VACIAS: Listas = { comerciales: [], tiposCliente: [], tiposEvento: [], rolesContacto: [], canales: [], intermediarios: [], montadores: [], categoriasGasto: [] };

// Listas editables (comerciales, tipos…) siempre al día. Una sola carga para toda la pantalla.
export function useListas() {
  const { datos } = useCompartido<Listas>("listas",
    ["comerciales", "tipos_cliente", "tipos_evento", "roles_contacto", "canales_lead", "intermediarios", "montadores", "categorias_gasto"],
    async (sb) => {
      const activos = (tabla: string, campos: string) =>
        sb.from(tabla).select(campos).eq("activo", true).order("orden").order("nombre");
      const [c, tc, te, rc, ca, i, mo, cg] = await Promise.all([
        activos("comerciales", "id, nombre"),
        activos("tipos_cliente", "codigo, nombre, reserva_pct"),
        activos("tipos_evento", "codigo, nombre"),
        activos("roles_contacto", "codigo, nombre"),
        activos("canales_lead", "codigo, nombre"),
        sb.from("intermediarios").select("id, nombre, comision_pct").is("deleted_at", null).order("nombre"),
        activos("montadores", "id, nombre"),
        activos("categorias_gasto", "codigo, nombre, tipo"),
      ]);
      const fallo = [c, tc, te, rc, ca, i, mo, cg].find((r) => r.error);
      if (fallo?.error) throw new Error(fallo.error.message);
      return {
        comerciales: (c.data ?? []) as unknown as Comercial[],
        tiposCliente: (tc.data ?? []) as unknown as Opcion[],
        tiposEvento: (te.data ?? []) as unknown as Opcion[],
        rolesContacto: (rc.data ?? []) as unknown as Opcion[],
        canales: (ca.data ?? []) as unknown as Opcion[],
        intermediarios: (i.data ?? []) as unknown as IntermediarioCorto[],
        montadores: (mo.data ?? []) as unknown as Comercial[],
        categoriasGasto: (cg.data ?? []) as unknown as Opcion[],
      };
    },
  );
  return datos ?? VACIAS;
}

export function nombreDe(lista: Opcion[], codigo: string | null | undefined): string {
  if (!codigo) return "—";
  return lista.find((o) => o.codigo === codigo)?.nombre ?? codigo;
}
