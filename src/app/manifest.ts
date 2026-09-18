import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BGS Dashboard — Boardroom Governance Summit",
    short_name: "BGS",
    description: "Planning, production and social command centre for the Boardroom Governance Summit.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#212162",
    theme_color: "#212162",
    lang: "en",
    dir: "ltr",
    categories: ["business", "productivity", "events"],
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Deliverables", short_name: "Tasks", url: "/deliverables?source=shortcut", icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96", type: "image/png" }] },
      { name: "Compose a post", short_name: "Compose", url: "/social/compose?source=shortcut", icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96", type: "image/png" }] },
      { name: "Action points", short_name: "Actions", url: "/meetings?source=shortcut", icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96", type: "image/png" }] },
      { name: "Record a ticket sale", short_name: "Tickets", url: "/tickets?new=1&source=shortcut", icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96", type: "image/png" }] },
    ],
  };
}
