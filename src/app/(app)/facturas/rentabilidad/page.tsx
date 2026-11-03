import { redirect } from "next/navigation";

// La rentabilidad se ha movido a Finanzas
export default function Page() {
  redirect("/finanzas/rentabilidad");
}
