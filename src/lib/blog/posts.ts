export type BlogPost = {
  slug: string;
  title: string;
  date: string;
  summary: string;
  body: string[];
};

/** Changelog estático honesto — sin tracción inventada. */
export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "gateway-openai-compatible",
    title: "Gateway OpenAI-compatible con catálogo propio",
    date: "2026-09-01",
    summary:
      "Una sola base URL, keys sk-nx-, 400+ modelos y fee solo al cargar créditos.",
    body: [
      "Nexus expone /api/v1 compatible con el SDK de OpenAI y con envelopes Responses / Messages.",
      "El catálogo vive en el repo (full.json + overlays). Sin keys de lab cableadas, el hop puede ser eco local — lo dice /status, no lo escondemos.",
      "Precio de inferencia = lista. Fee de plataforma al cargar créditos (4.9%). Signup con crédito de bienvenida documentado.",
    ],
  },
  {
    slug: "zdr-route-trace",
    title: "ZDR suave, Route Trace y tip-to-tip",
    date: "2026-09-02",
    summary:
      "Privacy que no vacía el plan, preview de hops y reintento laxo cuando hace falta.",
    body: [
      "ZDR prefiere endpoints marcados en el catálogo. allow_training filtra hosts que entrenan.",
      "Si el plan queda vacío, el chat reintenta en modo laxo para no romper tip-to-tip (eco / BYOK).",
      "POST /api/v1/routing/preview y el playground muestran adapter, wired y zdr antes de gastar.",
    ],
  },
  {
    slug: "media-studio-sdk",
    title: "Media Studio y SDK de management",
    date: "2026-09-03",
    summary:
      "Imagen, TTS, STT, video y embeddings con ledger; SDK tipado para chat y ops.",
    body: [
      "Studio unifica media en /studio. Cada hop escribe ledger cuando hay costo.",
      "El paquete packages/sdk (nexus-sdk) cubre chat, media, keys, files, analytics y recursos de management (presets, guardrails, BYOK, workspaces).",
      "Install recomendado vía file:packages/sdk hasta publicar un scope propio — el nombre npm público ya está ocupado.",
    ],
  },
  {
    slug: "chat-share-rss",
    title: "Chat share, recipes y RSS",
    date: "2026-09-03",
    summary:
      "Historial local, /share público, recipes en Apps y feed RSS sin tracción inventada.",
    body: [
      "El playground guarda sesiones en el dispositivo y puede publicar un share read-only en /share/{id}.",
      "/apps suma recipes curados (routing, ZDR, JSON, :online) encima del ranking real por HTTP-Referer.",
      "GET /rss.xml publica el changelog. Docs ahora cubren streaming, errors y limits.",
    ],
  },
  {
    slug: "vision-envelopes-arena",
    title: "Visión multimodal, envelopes y Arena blind",
    date: "2026-09-03",
    summary:
      "image_url en Chat/Files, Messages/Responses en el playground, Arena sin sesgo de slug.",
    body: [
      "El gateway ya aceptaba content[] con image_url; ahora Chat adjunta imágenes (pegar o file) y Files image/* se inyectan como parts, no como placeholder de bytes.",
      "El playground puede apuntar a /messages y /responses además de chat/completions — misma inferencia, reshape distinto.",
      "Arena corre A vs B en modo blind (slugs ocultos hasta votar) y copia resultado local. /api/v1/status expone mode live|echo según labs cableados.",
    ],
  },
];

export function getPost(slug: string) {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
