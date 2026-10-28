import { cn } from "@/lib/utils";

// Logo tipográfico provisional (el definitivo saldrá de CARPA DIEM/04. MEDIA).
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("font-heading leading-none text-brand", className)}>
      Carpa<i>Diem</i>
    </span>
  );
}
