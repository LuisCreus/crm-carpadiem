"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { Cabecera } from "@/components/cabecera";
import { EstadoVacio } from "@/components/estado-vacio";
import { EtiquetaEstado } from "@/components/etiqueta-estado";
import { claseSelect } from "@/components/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { nombreDe, useListas } from "@/hooks/use-listas";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { SELECT_PRESUPUESTO_LISTA, uno, type PresupuestoLista } from "@/lib/datos/tipos";
import { formatoEuros } from "@/lib/formato";
import { ESTADOS, textoFechaEvento, type EstadoPresupuesto } from "@/lib/negocio";

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function ListaPresupuestos() {
  const listas = useListas();
  const { datos, cargando, error } = useTablaEnVivo<PresupuestoLista>(["presupuestos", "clientes"], async (sb) => {
    const { data, error } = await sb
      .from("presupuestos")
      .select(SELECT_PRESUPUESTO_LISTA)
      .is("deleted_at", null)
      .order("anio", { ascending: false })
      .order("numero", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((p) => ({ ...p, cliente: uno(p.cliente), comercial: uno(p.comercial) })) as PresupuestoLista[];
  });

  // Los Pendientes con la fecha pasada pasan a Caducado (también lo hace la base de datos cada noche)
  useEffect(() => {
    void crearClienteNavegador().rpc("marcar_caducados");
  }, []);

  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<"" | EstadoPresupuesto>("");
  const [importeMin, setImporteMin] = useState("");
  const [importeMax, setImporteMax] = useState("");
  const [desde, setDesde] = useState("");

  const filtrados = useMemo(() => {
    const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
    return datos.filter((p) => {
      if (estado && p.estado !== estado) return false;
      if (importeMin && (p.importe ?? 0) < Number(importeMin)) return false;
      if (importeMax && (p.importe ?? Infinity) > Number(importeMax)) return false;
      if (desde && (!p.fecha_evento || p.fecha_evento < desde)) return false;
      if (!palabras.length) return true;
      const pajar = normalizar(
        [p.codigo, p.numero, p.cliente?.nombre, p.material, p.ubicacion, p.provincia, p.comercial?.nombre,
          nombreDe(listas.tiposEvento, p.tipo_evento)].join(" "),
      );
      return palabras.every((w) => pajar.includes(w));
    });
  }, [datos, texto, estado, importeMin, importeMax, desde, listas.tiposEvento]);

  const hayFiltros = texto || estado || importeMin || importeMax || desde;
  // En el móvil los filtros (salvo el buscador) se despliegan con un botón
  const [verFiltros, setVerFiltros] = useState(false);

  return (
    <>
      <Cabecera titulo="Presupuestos" subtitulo={cargando ? "Cargando…" : `${filtrados.length} de ${datos.length}`}>
        <Button render={<Link href="/presupuestos/nuevo" />}>+ Nuevo presupuesto</Button>
      </Cabecera>

      <div className="mb-5 flex flex-wrap items-end gap-2">
        <label className="flex h-9 min-w-0 flex-[1_1_280px] items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input
            type="search"
            aria-label="Buscar presupuestos"
            placeholder="Cliente, nº, material, lugar… (p. ej. “2 beduinas madrid”)"
            className="min-w-0 flex-1 bg-transparent outline-none"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </label>
        <Button variant="outline" className="md:hidden" aria-expanded={verFiltros} onClick={() => setVerFiltros(!verFiltros)}>
          <SlidersHorizontal className="size-4" aria-hidden /> Filtros{(estado || importeMin || importeMax || desde) ? " ·" : ""}
        </Button>
        <div className={verFiltros ? "flex w-full flex-wrap items-end gap-2 md:contents" : "hidden md:contents"}>
        <select aria-label="Estado" className={`${claseSelect} h-9 w-44 bg-card`} value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoPresupuesto | "")}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([valor, e]) => <option key={valor} value={valor}>{e.texto}</option>)}
        </select>
        <Input aria-label="Importe mínimo" type="number" inputMode="numeric" placeholder="Desde €" className="h-9 w-28 bg-card"
          value={importeMin} onChange={(e) => setImporteMin(e.target.value)} />
        <Input aria-label="Importe máximo" type="number" inputMode="numeric" placeholder="Hasta €" className="h-9 w-28 bg-card"
          value={importeMax} onChange={(e) => setImporteMax(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Evento desde
          <Input type="date" className="h-9 w-40 bg-card" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        </div>
        {hayFiltros && (
          <Button variant="ghost" size="sm" onClick={() => { setTexto(""); setEstado(""); setImporteMin(""); setImporteMax(""); setDesde(""); }}>
            Quitar filtros
          </Button>
        )}
      </div>

      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}

      {!cargando && datos.length === 0 && (
        <EstadoVacio titulo="Todavía no hay presupuestos" texto="Crea el primero; el CRM le asigna el número automáticamente.">
          <Button render={<Link href="/presupuestos/nuevo" />}>+ Nuevo presupuesto</Button>
        </EstadoVacio>
      )}
      {!cargando && datos.length > 0 && filtrados.length === 0 && (
        <EstadoVacio titulo="Ningún presupuesto coincide con la búsqueda" />
      )}

      {filtrados.length > 0 && (
        <>
          {/* Ordenador: tabla */}
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2.5 font-medium">Nº</th>
                  <th className="px-3 py-2.5 font-medium">Cliente</th>
                  <th className="px-3 py-2.5 font-medium">Fecha evento</th>
                  <th className="px-3 py-2.5 font-medium">Material</th>
                  <th className="px-3 py-2.5 font-medium">Lugar</th>
                  <th className="px-3 py-2.5 text-right font-medium">Importe</th>
                  <th className="px-3 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5 font-medium">Comercial</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-2.5 font-semibold whitespace-nowrap">
                      <Link href={`/presupuestos/${p.id}`} className="hover:underline">{p.codigo}</Link>
                      {p.anio !== new Date().getFullYear() && <span className="ml-1 text-xs font-normal text-muted-foreground">{p.anio}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/presupuestos/${p.id}`} className="font-medium">{p.cliente?.nombre}</Link>
                      <div className="text-xs text-muted-foreground">{nombreDe(listas.tiposEvento, p.tipo_evento)}</div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{textoFechaEvento(p.fecha_precision, p.fecha_evento, p.fecha_fin)}</td>
                    <td className="max-w-64 truncate px-3 py-2.5" title={p.material ?? ""}>{p.material}</td>
                    <td className="px-3 py-2.5">{[p.ubicacion, p.provincia].filter(Boolean).join(", ")}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatoEuros(p.importe)}</td>
                    <td className="px-3 py-2.5"><EtiquetaEstado estado={p.estado} /></td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.comercial?.nombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas */}
          <ul className="grid gap-2.5 md:hidden">
            {filtrados.map((p) => (
              <li key={p.id}>
                <Link href={`/presupuestos/${p.id}`} className="block rounded-xl border bg-card p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{p.codigo}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{p.cliente?.nombre}</span>
                    <EtiquetaEstado estado={p.estado} />
                  </div>
                  <div className="mt-1 text-[13px] text-muted-foreground">
                    {textoFechaEvento(p.fecha_precision, p.fecha_evento, p.fecha_fin)}
                    {p.provincia && ` · ${p.provincia}`} · {formatoEuros(p.importe)}
                  </div>
                  {p.material && <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{p.material}</div>}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
