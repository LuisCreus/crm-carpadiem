import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Instrument_Serif } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Tipografías de carpa-diem.com: Instrument Serif (títulos) y
// Hanken Grotesk (texto; versión libre de la HK Grotesk de la web).
const sans = Hanken_Grotesk({ variable: "--font-sans", subsets: ["latin"] });
const serif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: { default: "Carpa Diem CRM", template: "%s · Carpa Diem CRM" },
  description: "CRM de CARPADIEM IBÉRICA S.L.",
};

export const viewport: Viewport = {
  themeColor: "#FBFBFA",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${sans.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
