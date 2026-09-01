import { NextResponse, type NextRequest } from "next/server";

// Cabeceras de seguridad HTTP para toda la aplicación. Antes de esto no se
// enviaba ninguna (ver hallazgo #2 de la auditoría de seguridad): sin
// X-Frame-Options/frame-ancestors, cualquier página —incluido el login y el
// panel autenticado— podía incrustarse en un <iframe> de un sitio malicioso
// para un ataque de clickjacking; sin X-Content-Type-Options, se perdía una
// capa de defensa frente a archivos adjuntos con tipo declarado incorrecto
// (hallazgo #4).
//
// Nombrado `proxy.ts` (no `middleware.ts`): a partir de Next.js 16 esa es la
// convención vigente para este mismo mecanismo — incluir "Middleware" aquí
// generaría la advertencia de obsolescencia en cada build.
//
// La CSP usa un nonce por solicitud en vez de 'unsafe-inline' en script-src:
// el único <script> en línea real de la app (el detector de tema en
// app/layout.tsx) recibe el nonce vía la cabecera `x-nonce` reenviada a la
// solicitud. Los <script type="application/ld+json"> (datos estructurados)
// no ejecutan JavaScript y no están sujetos a script-src.
export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const isProd = process.env.NODE_ENV === "production";
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' es el patrón recomendado por Next.js junto al nonce:
    // permite que los scripts propios de Next (chunks, runtime de React) que
    // ya llevan el nonce carguen otros scripts de confianza sin listarlos uno
    // a uno. 'unsafe-eval' solo en desarrollo: React lo usa para reconstruir
    // stack traces del servidor en el navegador durante depuración; ni React
    // ni Next.js lo usan en producción.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Los estilos en línea (style={{...}}) de React se renderizan como
    // atributo style="" — un nonce no aplica a atributos HTML (solo a
    // elementos <script>/<style>), así que 'unsafe-inline' es el costo
    // práctico ineludible para style-src en una app que usa ese patrón.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (isProd) {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return response;
}

export const config = {
  matcher: [
    // Todo excepto assets estáticos de Next.js e íconos, que no necesitan
    // nonce ni se benefician de la CSP (y así se evita el costo del proxy en
    // cada archivo estático).
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|opengraph-image).*)",
  ],
};
