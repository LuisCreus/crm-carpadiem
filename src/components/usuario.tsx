"use client";

import { createContext, useContext, type ReactNode } from "react";

// Si quien usa la app es el administrador (Finanzas, Banco, Gestoría y correos solo los ve él).
// La base de datos y el servidor lo comprueban igualmente: esto solo oculta lo que no le toca a cada uno.
const Contexto = createContext(false);

export function ProveedorUsuario({ esAdmin, children }: { esAdmin: boolean; children: ReactNode }) {
  return <Contexto.Provider value={esAdmin}>{children}</Contexto.Provider>;
}

export const useEsAdmin = () => useContext(Contexto);
