import {
  Boxes, CalendarDays, FileText, Home, Receipt, Settings, Tent, Trash2, TrendingUp, UserRound, Users, type LucideIcon,
} from "lucide-react";

// "tambien": otras pantallas que cuentan como esta opción del menú (p. ej. las pestañas de Contactos)
export type ItemNav = { href: string; titulo: string; icono: LucideIcon; soloAdmin?: boolean; tambien?: string[] };

export const NAV_PRINCIPAL: ItemNav[] = [
  { href: "/", titulo: "Inicio", icono: Home },
  { href: "/leads", titulo: "Leads", icono: UserRound },
  { href: "/presupuestos", titulo: "Presupuestos", icono: FileText },
  { href: "/eventos", titulo: "Eventos", icono: Tent },
  { href: "/planificacion", titulo: "Planificación", icono: CalendarDays },
  { href: "/facturas", titulo: "Facturas", icono: Receipt },
  { href: "/finanzas", titulo: "Finanzas", icono: TrendingUp, soloAdmin: true },
  { href: "/proveedores", titulo: "Contactos", icono: Users, tambien: ["/intermediarios"] },
  { href: "/inventario", titulo: "Inventario", icono: Boxes },
];

export const NAV_SECUNDARIA: ItemNav[] = [
  { href: "/papelera", titulo: "Papelera", icono: Trash2, soloAdmin: true },
  { href: "/ajustes", titulo: "Ajustes", icono: Settings, soloAdmin: true },
];

// Pestañas de abajo en el móvil (el resto va en "Más")
export const NAV_MOVIL = ["/", "/planificacion", "/presupuestos", "/leads"];

export function itemActivo(pathname: string, item: ItemNav) {
  return [item.href, ...(item.tambien ?? [])].some((href) => estaActivo(pathname, href));
}

export function estaActivo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
