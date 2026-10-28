import type { NextConfig } from "next";

// Cache Components queda desactivado a propósito: el CRM es una app con sesión
// y casi todos los datos llegan en vivo desde Supabase (Realtime) en el navegador.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
