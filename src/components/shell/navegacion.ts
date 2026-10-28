import {
  Boxes, CalendarDays, FileText, Home, Settings, Tent, Trash2, UserRound, Users, type LucideIcon,
} from "lucide-react";

export type ItemNav = { href: string; titulo: string; icono: LucideIcon; soloAdmin?: boolean };

export const NAV_PRINCIPAL: ItemNav[] = [
  { href: "/", titulo: "Inicio", icono: Home },
  { href: "/leads", titulo: "Leads", icono: UserRound },
  { href: "/presupuestos", titulo: "Presupuestos", icono: FileText },
  { href: "/eventos", titulo: "Eventos", icono: Tent },
  { href: "/planificacion", titulo: "Planificación", icono: CalendarDays },
  { href: "/intermediarios", titulo: "Intermediarios", icono: Users },
  { href: "/inventario", titulo: "Inventario", icono: Boxes },
];

export const NAV_SECUNDARIA: ItemNav[] = [
  { href: "/papelera", titulo: "Papelera", icono: Trash2, soloAdmin: true },
  { href: "/ajustes", titulo: "Ajustes", icono: Settings, soloAdmin: true },
];

// Pestañas de abajo en el móvil (el resto va en "Más")
export const NAV_MOVIL = ["/", "/planificacion", "/presupuestos", "/leads"];

export function estaActivo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
