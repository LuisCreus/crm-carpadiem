import type { Metadata } from "next";
import { Proximamente } from "@/components/proximamente";

export const metadata: Metadata = { title: "Leads" };

export default function Page() {
  return <Proximamente titulo="Leads" fase={3} texto="Alta rápida de leads, vista Kanban y tabla con filtros." />;
}
