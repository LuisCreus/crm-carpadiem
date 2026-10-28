"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { claseSelect } from "@/components/campo";
import { HistorialDialogo } from "@/components/historial-dialogo";
import { useTablaEnVivo } from "@/hooks/use-tabla-en-vivo";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { codigoPresupuesto } from "@/lib/formato";
import { exportarAhora } from "@/lib/acciones-copias";

type Perfil = { id: string; email: string; nombre: string | null; rol: "admin" | "usuario"; activo: boolean };
type Ajustes = { dominios_permitidos: string[] };
type Numeracion = { anio: number; numero_inicial: number; ultimo_numero: number };

function Seccion({ titulo, texto, children }: { titulo: string; texto?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 md:p-6">
      <h2 className="text-[15px] font-semibold">{titulo}</h2>
      {texto && <p className="mt-1 text-sm text-muted-foreground">{texto}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

async function guardar(promesa: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await promesa;
  if (error) toast.error(`No se pudo guardar: ${error.message}`);
  else toast.success("Guardado ✓");
  return !error;
}

export function AjustesAdmin({ miId }: { miId: string }) {
  const supabase = crearClienteNavegador();

  const perfiles = useTablaEnVivo<Perfil>(["perfiles"], async (sb) => {
    const { data, error } = await sb.from("perfiles").select("id, email, nombre, rol, activo").order("email");
    if (error) throw new Error(error.message);
    return data as Perfil[];
  });

  const ajustes = useTablaEnVivo<Ajustes>(["ajustes"], async (sb) => {
    const { data, error } = await sb.from("ajustes").select("dominios_permitidos");
    if (error) throw new Error(error.message);
    return data as Ajustes[];
  });
  const dominios = ajustes.datos[0]?.dominios_permitidos ?? [];

  const numeracion = useTablaEnVivo<Numeracion>(["numeracion_anual"], async (sb) => {
    const { data, error } = await sb.from("numeracion_anual").select("anio, numero_inicial, ultimo_numero").order("anio");
    if (error) throw new Error(error.message);
    return data as Numeracion[];
  });

  const [nuevoDominio, setNuevoDominio] = useState("");
  const [nuevoAnio, setNuevoAnio] = useState("");

  async function anadirDominio(e: FormEvent) {
    e.preventDefault();
    const dominio = nuevoDominio.trim().toLowerCase().replace(/^@/, "");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominio)) {
      toast.error("Escribe un dominio válido, por ejemplo grupogilca.com");
      return;
    }
    if (dominios.includes(dominio)) return;
    const ok = await guardar(supabase.from("ajustes").update({ dominios_permitidos: [...dominios, dominio] }).eq("id", true));
    if (ok) setNuevoDominio("");
  }

  async function quitarDominio(dominio: string) {
    if (dominios.length === 1) {
      toast.error("Tiene que quedar al menos un dominio");
      return;
    }
    await guardar(supabase.from("ajustes").update({ dominios_permitidos: dominios.filter((d) => d !== dominio) }).eq("id", true));
  }

  async function anadirAnio(e: FormEvent) {
    e.preventDefault();
    const anio = Number(nuevoAnio);
    if (!Number.isInteger(anio) || anio < 2026 || anio > 2100) {
      toast.error("Escribe un año válido");
      return;
    }
    const ok = await guardar(supabase.from("numeracion_anual").insert({ anio, numero_inicial: 1 }));
    if (ok) setNuevoAnio("");
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <Seccion
        titulo="Usuarios"
        texto="Cualquiera de los dominios permitidos puede entrar con su cuenta de Microsoft; aparece aquí la primera vez que entra."
      >
        <ul className="divide-y rounded-lg border">
          {perfiles.datos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1 basis-56">
                <div className="truncate text-sm font-medium">{p.nombre || p.email}</div>
                <div className="truncate text-[13px] text-muted-foreground">{p.email}</div>
              </div>
              <select
                aria-label={`Rol de ${p.email}`}
                className={`${claseSelect} w-36`}
                value={p.rol}
                disabled={p.id === miId}
                onChange={(e) => guardar(supabase.from("perfiles").update({ rol: e.target.value }).eq("id", p.id))}
              >
                <option value="usuario">Usuario</option>
                <option value="admin">Administrador</option>
              </select>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={p.activo}
                  disabled={p.id === miId}
                  onCheckedChange={(activo) => guardar(supabase.from("perfiles").update({ activo }).eq("id", p.id))}
                />
                Activo
              </label>
              <HistorialDialogo tabla="perfiles" registroId={p.id} titulo={p.email} />
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion
        titulo="Dominios permitidos"
        texto="Solo pueden entrar cuentas de Microsoft de estos dominios (y de vuestro tenant)."
      >
        <div className="flex flex-wrap gap-2">
          {dominios.map((d) => (
            <span key={d} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-3 text-sm">
              @{d}
              <button
                type="button"
                aria-label={`Quitar ${d}`}
                className="rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                onClick={() => quitarDominio(d)}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
        <form onSubmit={anadirDominio} className="mt-4 flex max-w-sm gap-2">
          <Input
            aria-label="Nuevo dominio"
            placeholder="grupogilca.com"
            value={nuevoDominio}
            onChange={(e) => setNuevoDominio(e.target.value)}
          />
          <Button type="submit" variant="outline">Añadir</Button>
        </form>
      </Seccion>

      <Seccion
        titulo="Numeración de presupuestos"
        texto="Cada año empieza en su número inicial. Decide el de cada año nuevo antes del 1 de enero."
      >
        <ul className="divide-y rounded-lg border">
          {numeracion.datos.map((n) => (
            <li key={n.anio} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
              <span className="w-14 font-semibold">{n.anio}</span>
              <label className="flex items-center gap-2">
                Empieza en
                <Input
                  type="number"
                  min={1}
                  className="w-24"
                  defaultValue={n.numero_inicial}
                  onBlur={(e) => {
                    const valor = Number(e.target.value);
                    if (valor > 0 && valor !== n.numero_inicial) {
                      void guardar(supabase.from("numeracion_anual").update({ numero_inicial: valor }).eq("anio", n.anio));
                    }
                  }}
                />
              </label>
              <span className="text-muted-foreground">
                {n.ultimo_numero > 0 ? `Último: ${codigoPresupuesto(n.ultimo_numero)}` : "Sin presupuestos todavía"}
              </span>
            </li>
          ))}
        </ul>
        <form onSubmit={anadirAnio} className="mt-4 flex max-w-sm gap-2">
          <Input
            aria-label="Año nuevo"
            type="number"
            placeholder="2027"
            value={nuevoAnio}
            onChange={(e) => setNuevoAnio(e.target.value)}
          />
          <Button type="submit" variant="outline">Añadir año</Button>
        </form>
      </Seccion>
      <Seccion
        titulo="Copias de seguridad"
        texto="Cada lunes a las 7:00 se guarda un Excel con todo el CRM (Presupuestos, Eventos, Leads, Cobros y Material) en SharePoint. Se conservan las 12 últimas semanas. Es una foto para consultar: no se edita."
      >
        <CopiasDeSeguridad />
      </Seccion>
    </div>
  );
}

function CopiasDeSeguridad() {
  const [ocupado, setOcupado] = useState(false);
  const [ultima, setUltima] = useState<{ nombre: string; webUrl: string } | null>(null);

  async function exportar() {
    setOcupado(true);
    const r = await exportarAhora();
    setOcupado(false);
    if (!r.ok) return toast.error(r.error);
    setUltima(r);
    toast.success(`Copia guardada: ${r.nombre} (${r.filas} filas)`);
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Button disabled={ocupado} onClick={exportar}>{ocupado ? "Exportando…" : "Exportar ahora"}</Button>
        <Button variant="outline" render={<a href="/api/copias/descargar" />}>Descargar Excel</Button>
      </div>
      {ultima && (
        <p className="text-sm">
          Guardada <a href={ultima.webUrl} target="_blank" rel="noreferrer">{ultima.nombre}</a>
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Mientras dure la demo, las copias van a “00. CRM PRUEBAS/COPIAS DE SEGURIDAD”. En producción irán a “00. CRM/COPIAS DE SEGURIDAD”.
      </p>
    </div>
  );
}
