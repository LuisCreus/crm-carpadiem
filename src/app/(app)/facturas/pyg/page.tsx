import { redirect } from "next/navigation";

// La P&L se ha movido a Finanzas
export default function Page() {
  redirect("/finanzas");
}
