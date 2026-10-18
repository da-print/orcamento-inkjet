// Service worker do Orçamento Inkjet.
// Objetivo: permitir instalar como app e abrir rápido/offline a "casca" do site.
// Regras de segurança: só mexe em GET do mesmo domínio. NUNCA cacheia chamadas ao
// Supabase (outro domínio), então dados sempre vêm frescos da rede.
const CACHE = "inkjet-v2";
const CORE = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase e externos: direto na rede.

  // Navegação (abrir o site): rede primeiro, cai pro cache se estiver offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put("/", cp)); return r; })
        .catch(() => caches.match("/").then((r) => r || caches.match("/index.html")))
    );
    return;
  }

  // Demais arquivos do mesmo domínio (JS/CSS/ícones, com nome versionado pelo build):
  // cache primeiro, atualiza em segundo plano.
  e.respondWith(
    caches.match(req).then((c) => c || fetch(req).then((r) => {
      if (r && r.ok) { const cp = r.clone(); caches.open(CACHE).then((cc) => cc.put(req, cp)); }
      return r;
    }))
  );
});
