"use client";

// Campo de texto con sugerencias al escribir (proveedores, eventos…).
// Se puede elegir con el ratón o con las flechas y Enter.

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type Sugerencia = { id: string; texto: string; detalle?: string };

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function Autocompletar({ id, valor, onTexto, onElegir, sugerencias, placeholder, required, autoFocus, max = 8 }: {
  id: string;
  valor: string;
  onTexto: (texto: string) => void;
  onElegir: (s: Sugerencia) => void;
  sugerencias: Sugerencia[];
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  max?: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  const lista = useId();

  // Coinciden todas las palabras escritas, en cualquier orden y sin importar tildes
  const filtradas = useMemo(() => {
    const palabras = normalizar(valor).split(/\s+/).filter(Boolean);
    return sugerencias
      .filter((s) => palabras.every((p) => normalizar(`${s.texto} ${s.detalle ?? ""}`).includes(p)))
      .slice(0, max);
  }, [valor, sugerencias, max]);

  function elegir(s: Sugerencia) {
    onElegir(s);
    setAbierto(false);
  }

  function teclas(e: KeyboardEvent<HTMLInputElement>) {
    if (!abierto || !filtradas.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiva((a) => (a + 1) % filtradas.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiva((a) => (a - 1 + filtradas.length) % filtradas.length); }
    else if (e.key === "Enter") { e.preventDefault(); elegir(filtradas[activa]); }
    else if (e.key === "Escape") { e.stopPropagation(); setAbierto(false); }
  }

  return (
    <div className="relative">
      <Input id={id} value={valor} required={required} autoFocus={autoFocus} placeholder={placeholder} autoComplete="off"
        role="combobox" aria-expanded={abierto && filtradas.length > 0} aria-controls={lista} aria-autocomplete="list"
        onChange={(e) => { onTexto(e.target.value); setAbierto(true); setActiva(0); }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={teclas} />
      {abierto && filtradas.length > 0 && (
        <ul id={lista} role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-md">
          {filtradas.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === activa}
              onMouseDown={(e) => { e.preventDefault(); elegir(s); }}
              onMouseEnter={() => setActiva(i)}
              className={cn("cursor-pointer rounded-md px-2.5 py-1.5 text-sm", i === activa && "bg-muted")}>
              <div>{s.texto}</div>
              {s.detalle && <div className="text-xs text-muted-foreground">{s.detalle}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
