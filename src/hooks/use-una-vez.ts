"use client";

import { useCallback, useRef, useState } from "react";

// Envuelve un "Guardar" para que un doble toque no lo ejecute dos veces
// (si no, se duplican cobros, contactos, leads…). "enCurso" sirve para desactivar el botón.
export function useUnaVez() {
  const ocupado = useRef(false);
  const [enCurso, setEnCurso] = useState(false);
  const unaVez = useCallback(<A extends unknown[]>(fn: (...args: A) => unknown) => async (...args: A) => {
    if (ocupado.current) {
      (args[0] as { preventDefault?: () => void } | undefined)?.preventDefault?.();
      return;
    }
    ocupado.current = true;
    setEnCurso(true);
    try {
      await fn(...args);
    } finally {
      ocupado.current = false;
      setEnCurso(false);
    }
  }, []);
  return { enCurso, unaVez };
}
