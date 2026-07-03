import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NexaLab — Sistema de Laboratorio Educativo",
    short_name: "NexaLab",
    description:
      "NexaLab organiza inventario, equipos, prácticas y reservas de laboratorios educativos en una experiencia clara y trazable.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f7f5",
    theme_color: "#1d6b64",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
