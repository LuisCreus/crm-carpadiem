"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { rango, useDisponibilidad } from "@/hooks/use-disponibilidad";
import { diasMaterial, textoFalta } from "@/lib/disponibilidad";
import { leerMaterial, RECURSOS, type Cantidades } from "@/lib/material";
import type { PrecisionFecha } from "@/lib/negocio";

// Las 4 casillas del material (beduinas, modulares, m² de tarima, sombrillas).
// Se rellenan solas con el texto del material hasta que alguien las cambia a mano.
// Debajo, si con lo ya confirmado esos días no hay material suficiente, lo avisa.
export function CamposMaterial({ material, valor, cambiar, fechas, presupuestoId, aManoInicial = false }: {
  material: string;
  valor: Cantidades;
  cambiar: (c: Cantidades) => void;
  fechas: { precision: PrecisionFecha; inicio: string | null; fin: string | null };
  presupuestoId?: string;
  aManoInicial?: boolean; // al editar: no pisar lo que ya se corrigió a mano
}) {
  const [aMano, setAMano] = useState(aManoInicial);
  const disponible = useDisponibilidad();

  useEffect(() => {
    if (aMano) return;
    const leido = leerMaterial(material);
    if (RECURSOS.some((r) => leido[r.clave] !== valor[r.clave])) cambiar(leido);
  }, [material, aMano]); // eslint-disable-line react-hooks/exhaustive-deps

  const dias = diasMaterial({ fecha_precision: fechas.precision, fecha_inicio: fechas.inicio, fecha_fin: fechas.fin });
  const faltan = dias && disponible.listo
    ? disponible.siSeAceptara({ id: presupuestoId ?? "nuevo", nombre: "Este presupuesto", ...dias, cantidades: valor })
    : [];

  return (
    <div className="grid gap-2 sm:col-span-2">
      <div className="text-sm font-medium">Material para el aviso de disponibilidad <span className="font-normal text-muted-foreground">(se rellena con el texto; corrígelo si hace falta)</span></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RECURSOS.map((r) => (
          <label key={r.clave} className="grid gap-1 text-xs text-muted-foreground">
            {r.nombre}{r.unidad === "m²" ? " (m²)" : ""}
            <Input type="number" min={0} step={r.unidad === "m²" ? "any" : 1} inputMode="decimal" value={valor[r.clave] || ""} placeholder="0"
              onChange={(e) => { setAMano(true); cambiar({ ...valor, [r.clave]: Math.max(0, Number(e.target.value) || 0) }); }} />
          </label>
        ))}
      </div>
      {faltan.map((f) => (
        <p key={`${f.recurso}${f.desde}`} role="alert" className="rounded-lg bg-[#FDF3E1] px-3 py-2 text-xs text-[#8A5A0B]">
          ⚠ Si se acepta: {textoFalta(f)} {rango(f)} (ya está {f.nombres.filter((n) => n !== "Este presupuesto").join(", ")}). Alquílalo o plantéate comprar más.
        </p>
      ))}
    </div>
  );
}

export const cantidadesDePresupuesto = (p: { uds_beduinas: number; uds_modulares: number; m2_tarima: number | string; uds_sombrillas: number }): Cantidades =>
  ({ beduinas: p.uds_beduinas, modulares: p.uds_modulares, tarima_m2: Number(p.m2_tarima), sombrillas: p.uds_sombrillas });

export const columnasMaterial = (c: Cantidades) =>
  ({ uds_beduinas: c.beduinas, uds_modulares: c.modulares, m2_tarima: c.tarima_m2, uds_sombrillas: c.sombrillas });
