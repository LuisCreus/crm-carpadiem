"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { uno } from "@/lib/datos/tipos";
import { textoFechaEvento } from "@/lib/negocio";
import { cn } from "@/lib/utils";

type Resultado = { tipo: string; titulo: string; detalle: string; href: string; pajar: string };

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Búsqueda global (Ctrl+K / ⌘K): cliente, nº de presupuesto, lugar, fecha o intermediario
export function abrirBusqueda() {
  window.dispatchEvent(new Event("abrir-busqueda"));
}

export function BusquedaGlobal() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [indice, setIndice] = useState<Resultado[]>([]);
  const [activo, setActivo] = useState(0);
  const cargado = useRef(false);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierto((a) => !a);
      }
    };
    // Otros botones (p. ej. el de la lupa del móvil) la abren con este evento
    const evento = () => setAbierto(true);
    window.addEventListener("keydown", tecla);
    window.addEventListener("abrir-busqueda", evento);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("abrir-busqueda", evento);
    };
  }, []);

  useEffect(() => {
    if (!abierto || cargado.current) return;
    cargado.current = true;
    const sb = crearClienteNavegador();
    void Promise.all([
      sb.from("presupuestos").select("id, codigo, fecha_precision, fecha_evento, fecha_fin, ubicacion, provincia, material, cliente:clientes(nombre), intermediario:intermediarios(nombre)").is("deleted_at", null).order("numero", { ascending: false }),
      sb.from("eventos").select("id, fecha_precision, fecha_inicio, fecha_fin, ubicacion, provincia, cliente:clientes(nombre)").is("deleted_at", null),
      sb.from("leads").select("id, cliente_nombre, lugar_aprox, fecha_evento_aprox").is("deleted_at", null),
      sb.from("intermediarios").select("id, nombre, tipo").is("deleted_at", null),
    ]).then(([pr, ev, le, it]) => {
      const r: Resultado[] = [];
      for (const p of pr.data ?? []) {
        const fecha = textoFechaEvento(p.fecha_precision, p.fecha_evento, p.fecha_fin);
        const cliente = uno(p.cliente)?.nombre ?? "";
        const inter = uno(p.intermediario)?.nombre ?? "";
        r.push({ tipo: "Presupuesto", titulo: `${p.codigo} · ${cliente}`, detalle: [fecha, p.ubicacion, inter].filter(Boolean).join(" · "), href: `/presupuestos/${p.id}`,
          pajar: normalizar([p.codigo, p.codigo.replace(" ", ""), cliente, fecha, p.ubicacion, p.provincia, inter, p.material].join(" ")) });
      }
      for (const e of ev.data ?? []) {
        const fecha = textoFechaEvento(e.fecha_precision, e.fecha_inicio, e.fecha_fin);
        const cliente = uno(e.cliente)?.nombre ?? "";
        r.push({ tipo: "Evento", titulo: cliente, detalle: [fecha, e.ubicacion].filter(Boolean).join(" · "), href: `/eventos/${e.id}`,
          pajar: normalizar([cliente, fecha, e.ubicacion, e.provincia].join(" ")) });
      }
      for (const l of le.data ?? []) {
        r.push({ tipo: "Lead", titulo: l.cliente_nombre, detalle: [l.fecha_evento_aprox, l.lugar_aprox].filter(Boolean).join(" · "), href: "/leads",
          pajar: normalizar([l.cliente_nombre, l.lugar_aprox, l.fecha_evento_aprox].join(" ")) });
      }
      for (const i of it.data ?? []) {
        r.push({ tipo: "Intermediario", titulo: i.nombre, detalle: "", href: "/intermediarios", pajar: normalizar(i.nombre) });
      }
      setIndice(r);
    });
  }, [abierto]);

  const resultados = useMemo(() => {
    const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
    if (!palabras.length) return [];
    return indice.filter((r) => palabras.every((p) => r.pajar.includes(p))).slice(0, 30);
  }, [texto, indice]);

  function ir(r: Resultado | undefined) {
    if (!r) return;
    setAbierto(false);
    setTexto("");
    router.push(r.href);
  }

  return (
    <>
      <Dialog open={abierto} onOpenChange={(a) => { setAbierto(a); if (!a) cargado.current = false; }}>
        <DialogContent className="top-[12dvh] translate-y-0 gap-0 p-0 sm:max-w-xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Buscar</DialogTitle>
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              aria-label="Buscar en el CRM"
              placeholder="Cliente, nº de presupuesto, lugar, fecha, intermediario…"
              className="h-12 flex-1 bg-transparent text-[15px] outline-none"
              value={texto}
              onChange={(e) => { setTexto(e.target.value); setActivo(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActivo((a) => Math.min(a + 1, resultados.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter") ir(resultados[activo]);
              }}
            />
            <kbd className="rounded border px-1.5 text-[11px] text-muted-foreground">Esc</kbd>
          </div>
          <ul className="max-h-[55dvh] overflow-y-auto p-1.5" role="listbox" aria-label="Resultados">
            {texto && resultados.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Sin resultados</li>}
            {!texto && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Escribe para buscar. Prueba “078”, “Toledo” o “junio 2027”.</li>}
            {resultados.map((r, i) => (
              <li key={r.href + i} role="option" aria-selected={i === activo}>
                <button type="button" onMouseEnter={() => setActivo(i)} onClick={() => ir(r)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", i === activo && "bg-muted")}>
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{r.tipo}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.titulo}</span>
                    {r.detalle && <span className="block truncate text-xs text-muted-foreground">{r.detalle}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
