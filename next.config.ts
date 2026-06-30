import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Habilita el build standalone (server.js autocontenido + node_modules
  // mínimos trazados) usado por Dockerfile para Azure Container Apps. No
  // afecta `next dev` ni el despliegue en Vercel (Vercel ignora `output`).
  output: "standalone",
  // `pg` usa requires dinámicos (carga opcional de pg-native/pg-cloudflare)
  // que el bundler de Next.js no resuelve de forma fiable, lo que rompe en
  // silencio su negociación de TLS cuando queda empaquetado dentro del
  // chunk del servidor. Excluirlo del bundle (require() en tiempo de
  // ejecución desde node_modules, que sí queda incluido en el output
  // standalone vía trazado) es el workaround estándar de Next.js para este
  // tipo de paquetes nativos/dinámicos.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
