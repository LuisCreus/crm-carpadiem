"use client";

import { useEffect } from "react";

// Registra el service worker (necesario para instalar el CRM como app)
export function RegistrarSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
