// Service worker del CRM de Carpa Diem.
// Los datos SIEMPRE se piden en vivo (nada de datos de clientes guardados en el
// móvil). Solo se guardan los iconos y una página de "sin conexión".

const CACHE = "carpadiem-v1";
const ESTATICOS = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/logo-carpadiem.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESTATICOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Páginas: siempre de la red; si no hay conexión, la página de aviso
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  // Iconos y logo: de la caché si están
  const url = new URL(request.url);
  if (url.origin === self.location.origin && ESTATICOS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((r) => r || fetch(request)));
  }
});
