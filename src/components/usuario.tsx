"use client";

import { createContext, useContext, type ReactNode } from "react";

// Si quien usa la app es el administrador (Finanzas, Banco, Gestoría y correos solo los ve él).
// La base de datos y el servidor lo comprueban igualmente: esto solo oculta lo que no le toca a cada uno.
const Contexto = createContext({ esAdmin: false, esSocio: false });

export function ProveedorUsuario({ esAdmin, esSocio, children }: { esAdmin: boolean; esSocio: boolean; children: ReactNode }) {
  return <Contexto.Provider value={{ esAdmin, esSocio }}>{children}</Contexto.Provider>;
}

export const useEsAdmin = () => useContext(Contexto).esAdmin;
// Socios: ven facturas, cobros, banco y finanzas, pero sin botones para cambiarlos
export const useSoloLectura = () => useContext(Contexto).esSocio;
export const useVeFinanzas = () => { const c = useContext(Contexto); return c.esAdmin || c.esSocio; };
