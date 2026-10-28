// Nombres legibles de los campos y las acciones del historial
export const NOMBRES_CAMPO: Record<string, string> = {
  nombre: "Nombre",
  tipo: "Tipo",
  comision_pct: "Comisión %",
  contacto_nombre: "Contacto",
  telefono: "Teléfono",
  email: "Email",
  notas: "Notas",
  rol: "Rol",
  activo: "Activo",
  deleted_at: "Papelera",
  deleted_by: "Borrado por",
  dominios_permitidos: "Dominios permitidos",
  estado: "Estado",
  importe: "Importe",
  material: "Material",
  fecha_evento: "Fecha del evento",
  ubicacion: "Ubicación",
  provincia: "Provincia",
  reserva_pct: "% de reserva",
};

export const NOMBRES_ACCION: Record<string, string> = {
  crear: "creó el registro",
  editar: "editó",
  borrar: "lo movió a la papelera",
  restaurar: "lo restauró",
  eliminar: "lo borró definitivamente",
};

export function valorLegible(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "vacío";
  if (typeof valor === "boolean") return valor ? "sí" : "no";
  if (Array.isArray(valor)) return valor.join(", ");
  return String(valor);
}
