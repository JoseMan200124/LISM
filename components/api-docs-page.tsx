import Link from "next/link";
import { ArrowRight, BookOpen, KeyRound, ShieldCheck, Webhook } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { DeveloperCredit } from "@/components/developer-credit";
import { PublicThemeToggle } from "@/components/public-theme-toggle";
import { scopeLabels, INTEGRATION_SCOPES } from "@/lib/integration-scopes";

// Documentación técnica pública de la API de integración.
//
// Es pública a propósito: quien conecta el ERP de una institución casi nunca
// tiene usuario en NexaLab, y necesita leer esto ANTES de que alguien le emita
// una credencial. Describe la forma de la API, nunca datos de un laboratorio.
//
// El catálogo de operaciones llega como prop desde la página (server), que lo
// deriva del mismo registro que atiende las llamadas: si una operación no
// existe, tampoco aparece aquí.

export type DocOperation = {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  scope: string;
};

export type DocGroup = {
  tag: string;
  operations: DocOperation[];
};

const SECTIONS = [
  { id: "empezar", label: "Empezar" },
  { id: "autenticacion", label: "Autenticación" },
  { id: "permisos", label: "Modelo de permisos" },
  { id: "operaciones", label: "Operaciones" },
  { id: "alcances", label: "Alcances" },
  { id: "webhooks", label: "Webhooks" },
  { id: "errores", label: "Errores" },
  { id: "plataformas", label: "Guías por plataforma" },
];

function Code({ children }: Readonly<{ children: React.ReactNode }>) {
  return <pre className="api-docs-code"><code>{children}</code></pre>;
}

export function ApiDocsPage({ groups, baseUrl }: Readonly<{ groups: DocGroup[]; baseUrl: string }>) {
  const total = groups.reduce((sum, group) => sum + group.operations.length, 0);

  return (
    <main className="landing-page api-docs">
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Link href="/" className="landing-brand" aria-label="Ir al inicio de NexaLab">
            <BrandLogo compact priority />
          </Link>
          <nav className="landing-nav" aria-label="Secciones de la documentación">
            <a href="#empezar">Empezar</a>
            <a href="#autenticacion">Autenticación</a>
            <a href="#operaciones">Operaciones</a>
            <a href="#webhooks">Webhooks</a>
          </nav>
          <div className="landing-header-actions">
            <PublicThemeToggle />
            <Link className="landing-button landing-button-small" href="/login">
              Iniciar sesión
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <section className="api-docs-hero">
        <div className="landing-container">
          <p className="landing-eyebrow"><span /> Documentación técnica</p>
          <h1>API de integración de NexaLab</h1>
          <p className="api-docs-lead">
            Conecta los módulos del laboratorio con tu ERP, SAP, Power Apps o cualquier otro
            sistema. {total} operaciones REST sobre inventario, equipos, muestras, resultados,
            compras, cumplimiento, incidencias, alertas, educación, investigación y trazabilidad.
          </p>
          <div className="api-docs-hero-actions">
            <a className="landing-button" href="/api/v1/openapi" target="_blank" rel="noreferrer">
              <BookOpen size={15} aria-hidden="true" /> Spec OpenAPI 3.1
            </a>
            <a className="landing-button landing-button-light" href="/api/v1/openapi/powerapps" target="_blank" rel="noreferrer">
              Conector para Power Apps
            </a>
          </div>
        </div>
      </section>

      <div className="landing-container api-docs-layout">
        <aside className="api-docs-nav" aria-label="Índice">
          <p className="api-docs-nav-title">Contenido</p>
          <ul>
            {SECTIONS.map((section) => (
              <li key={section.id}><a href={`#${section.id}`}>{section.label}</a></li>
            ))}
          </ul>
        </aside>

        <div className="api-docs-body">
          <section id="empezar">
            <h2>Empezar</h2>
            <p>
              La integración va en dos direcciones, y una implementación completa suele usar
              las dos.
            </p>
            <div className="api-docs-cards">
              <div className="api-docs-card">
                <KeyRound size={18} aria-hidden="true" />
                <h3>De tu sistema hacia NexaLab</h3>
                <p>
                  Un gateway REST en <code>/api/v1</code>: consulta existencias, crea
                  solicitudes de compra, registra recepciones.
                </p>
              </div>
              <div className="api-docs-card">
                <Webhook size={18} aria-hidden="true" />
                <h3>De NexaLab hacia tu sistema</h3>
                <p>
                  Webhooks firmados: NexaLab avisa en el momento en que algo ocurre, sin que
                  tengas que preguntar cada rato.
                </p>
              </div>
            </div>

            <h3>Los tres pasos</h3>
            <ol className="api-docs-steps">
              <li>
                <strong>Pide la credencial.</strong> La emite un administrador del laboratorio
                desde <em>Integraciones → Credenciales</em>. Recibirás un <code>client_id</code> y
                una clave secreta que solo se muestra una vez.
              </li>
              <li>
                <strong>Comprueba que funciona.</strong> Llama a <code>GET /api/v1/me</code>: te
                dice el laboratorio, los alcances concedidos y la lista exacta de operaciones que
                tienes permitidas.
              </li>
              <li>
                <strong>Integra.</strong> Usa el spec OpenAPI para generar un cliente, o llama
                directo con la cabecera <code>X-API-Key</code>.
              </li>
            </ol>

            <Code>{`curl -H "X-API-Key: nxk_live_…" \\
  ${baseUrl}/api/v1/me`}</Code>
          </section>

          <section id="autenticacion">
            <h2>Autenticación</h2>
            <p>
              La misma credencial se presenta de dos formas. Elige la que soporte tu plataforma;
              no conceden nada distinto.
            </p>

            <h3>Opción A — Clave directa</h3>
            <p>Lo que usan Power Apps, la mayoría de ERP y cualquier herramienta que sepa poner una cabecera fija.</p>
            <Code>{`GET /api/v1/inventory/items
X-API-Key: nxk_live_…`}</Code>
            <p>También se acepta <code>Authorization: Bearer nxk_live_…</code>.</p>

            <h3>Opción B — OAuth2 client_credentials</h3>
            <p>
              Para SAP y plataformas corporativas que prohíben guardar un secreto permanente en
              el cliente. El token dura una hora.
            </p>
            <Code>{`curl -X POST ${baseUrl}/api/v1/oauth/token \\
  -d "grant_type=client_credentials" \\
  -d "client_id=nxc_…" \\
  -d "client_secret=nxk_live_…"

{
  "access_token": "eyJhbGciOi…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "inventory:read purchasing:write"
}`}</Code>

            <div className="api-docs-note">
              <ShieldCheck size={17} aria-hidden="true" />
              <p>
                El secreto se muestra <strong>una sola vez</strong>. NexaLab guarda solo su huella
                criptográfica. Si se pierde, se rota desde el panel: se emite uno nuevo y el
                anterior deja de servir en el acto.
              </p>
            </div>
          </section>

          <section id="permisos">
            <h2>Modelo de permisos</h2>
            <p>Tres reglas gobiernan todo lo que puede hacer una integración.</p>

            <ol className="api-docs-steps">
              <li>
                <strong>Una credencial pertenece a un laboratorio.</strong> Una institución con
                tres laboratorios emite tres credenciales. El alcance nunca es ambiguo.
              </li>
              <li>
                <strong>Una credencial nunca puede hacer más que una persona identificable.</strong>{" "}
                Sus permisos efectivos son la <em>intersección</em> de los alcances concedidos con
                lo que puede hacer hoy el usuario responsable de esa credencial. Conceder{" "}
                <code>inventory:write</code> a una credencial cuyo responsable solo puede leer
                inventario no habilita nada.
              </li>
              <li>
                <strong>Todo queda en la bitácora.</strong> Una solicitud de compra creada por SAP
                pasa por las mismas validaciones, los mismos flujos y el mismo registro de
                auditoría que una creada a mano. No existe un camino «de servicio» que se salte
                reglas.
              </li>
            </ol>

            <div className="api-docs-note api-docs-note-warn">
              <p>
                <strong>Consecuencia práctica:</strong> si el usuario responsable deja la
                institución o pierde el acceso al laboratorio, la integración deja de funcionar.
                Es deliberado. Antes de que alguien se vaya, traspasa sus credenciales.
              </p>
            </div>
          </section>

          <section id="operaciones">
            <h2>Operaciones</h2>
            <p>
              {total} operaciones agrupadas por módulo. Cada una indica el alcance que necesita.
              Todas cuelgan de <code>{baseUrl}/api/v1</code>.
            </p>

            {groups.map((group) => (
              <div key={group.tag} className="api-docs-group">
                <h3>{group.tag}</h3>
                <div className="api-docs-table-wrap">
                  <table className="api-docs-table">
                    <thead>
                      <tr><th>Método</th><th>Ruta</th><th>Qué hace</th><th>Alcance</th></tr>
                    </thead>
                    <tbody>
                      {group.operations.map((operation) => (
                        <tr key={operation.operationId}>
                          <td><span className={`api-method api-method-${operation.method.toLowerCase()}`}>{operation.method}</span></td>
                          <td><code>{operation.path}</code></td>
                          <td>{operation.summary}</td>
                          <td><code className="api-scope">{operation.scope}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <h3>Paginación</h3>
            <p>
              Añade <code>limit</code> (1-500, por omisión 100) y <code>offset</code> a cualquier
              colección. La respuesta incluye un objeto <code>pagination</code> con el total.
            </p>
            <Code>{`GET /api/v1/inventory/items?limit=50&offset=100`}</Code>

            <h3>Límite de llamadas</h3>
            <p>
              Por omisión 120 por minuto y credencial, configurable al emitirla. Al superarlo se
              devuelve <code>429</code> con <code>retryAfterSeconds</code>.
            </p>
          </section>

          <section id="alcances">
            <h2>Alcances</h2>
            <p>
              Un alcance de escritura incluye siempre su lectura. Pide lo mínimo: un ERP de
              compras normalmente solo necesita inventario, compras y catálogo.
            </p>
            <div className="api-docs-table-wrap">
              <table className="api-docs-table">
                <thead><tr><th>Alcance</th><th>Qué permite</th></tr></thead>
                <tbody>
                  {INTEGRATION_SCOPES.map((scope) => (
                    <tr key={scope}>
                      <td><code className="api-scope">{scope}</code></td>
                      <td>{scopeLabels[scope]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="webhooks">
            <h2>Webhooks</h2>
            <p>
              Un administrador los registra en <em>Integraciones → Webhooks</em>, indicando la URL
              de destino (HTTPS obligatorio) y los eventos. Se admiten comodines:{" "}
              <code>*</code> para todo, <code>INVENTORY_*</code> para un módulo entero, o el nombre
              exacto de una acción.
            </p>

            <h3>Forma del envío</h3>
            <Code>{`POST https://tu-erp.institucion.com/hooks/nexalab
Content-Type: application/json
x-nexalab-event: INVENTORY_ITEM_CREATED
x-nexalab-delivery: 6f1c…
x-nexalab-timestamp: 1753900000
x-nexalab-signature: v1=<hmac-sha256-hex>

{
  "id": "…",
  "type": "INVENTORY_ITEM_CREATED",
  "createdAt": "2026-07-30T18:22:11.000Z",
  "data": { "action": "…", "entityId": "…", "newValue": { … } }
}`}</Code>

            <h3>Verifica la firma siempre</h3>
            <p>
              Calcula el HMAC sobre el <strong>cuerpo crudo</strong>, antes de parsear el JSON, y
              compara con tiempo constante.
            </p>
            <Code>{`const esperado = "v1=" + crypto
  .createHmac("sha256", SECRETO)
  .update(\`\${headers["x-nexalab-timestamp"]}.\${cuerpoCrudo}\`)
  .digest("hex");`}</Code>

            <h3>Reintentos e idempotencia</h3>
            <p>
              Si no respondes <code>2xx</code>, NexaLab reintenta hasta 5 veces con espera
              creciente (1, 5, 15 y 60 minutos). El campo <code>id</code> es estable entre
              reintentos: úsalo para descartar duplicados. Responde <code>2xx</code> en cuanto
              recibas el evento y procésalo después; si tardas más de 10 segundos, el envío se da
              por fallido.
            </p>
          </section>

          <section id="errores">
            <h2>Errores</h2>
            <p>Siempre con la forma <code>{`{ "error": "<código>", "message": "<explicación>" }`}</code>.</p>
            <div className="api-docs-table-wrap">
              <table className="api-docs-table">
                <thead><tr><th>Código</th><th>HTTP</th><th>Significado</th></tr></thead>
                <tbody>
                  <tr><td><code>missing_credentials</code></td><td>401</td><td>No se envió credencial</td></tr>
                  <tr><td><code>invalid_credentials</code></td><td>401</td><td>Clave o token inválido</td></tr>
                  <tr><td><code>revoked</code> / <code>expired</code></td><td>403</td><td>Credencial revocada o vencida</td></tr>
                  <tr><td><code>actor_without_access</code></td><td>403</td><td>El usuario responsable ya no tiene acceso al laboratorio</td></tr>
                  <tr><td><code>insufficient_scope</code></td><td>403</td><td>Falta el alcance; la respuesta dice cuál</td></tr>
                  <tr><td><code>rate_limited</code></td><td>429</td><td>Se superó el límite por minuto</td></tr>
                  <tr><td><code>not_found</code></td><td>404</td><td>La ruta no existe en la API</td></tr>
                  <tr><td><code>invalid_json</code></td><td>400</td><td>El cuerpo no es JSON válido</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              Los errores de validación de negocio llegan tal cual del módulo, con{" "}
              <code>message</code> e <code>issues</code> señalando exactamente qué campo falta.
            </p>
            <p>
              Cada respuesta lleva <code>x-nexalab-request-id</code>. Cítalo al reportar un
              problema: la llamada queda registrada con su duración y su resultado.
            </p>
          </section>

          <section id="plataformas">
            <h2>Guías por plataforma</h2>

            <h3>Power Apps y Power Automate</h3>
            <ol className="api-docs-steps">
              <li>Descarga el <a href="/api/v1/openapi/powerapps">archivo del conector</a>.</li>
              <li>En Power Apps: <em>Conectores personalizados → Nuevo conector → Importar un archivo OpenAPI</em>.</li>
              <li>En <em>Seguridad</em>, elige <strong>Clave de API</strong>, parámetro <code>X-API-Key</code>, ubicación <strong>Encabezado</strong>.</li>
              <li>Crea la conexión pegando la clave emitida en NexaLab.</li>
            </ol>
            <p className="api-docs-aside">
              Se publica en Swagger 2.0 porque es el único formato que acepta ese importador. Para
              todo lo demás, usa el OpenAPI 3.1.
            </p>

            <h3>SAP</h3>
            <p>
              Usa el flujo OAuth2 <code>client_credentials</code> contra{" "}
              <code>/api/v1/oauth/token</code>. Registra el destino con la URL base{" "}
              <code>{baseUrl}/api/v1</code> y renueva el token cuando expire. Para el sentido
              contrario, registra un webhook apuntando al endpoint de tu middleware.
            </p>

            <h3>Cualquier otro ERP o desarrollo propio</h3>
            <p>
              Envía <code>X-API-Key</code> en cada llamada y genera el cliente desde el{" "}
              <a href="/api/v1/openapi">spec OpenAPI</a>. Ejemplo de sincronización de existencias:
            </p>
            <Code>{`BASE="${baseUrl}/api/v1"
CLAVE="nxk_live_…"

# Traer el inventario
curl -H "X-API-Key: $CLAVE" "$BASE/inventory/items?limit=200"

# Registrar una entrada tras recibir una compra
curl -X POST "$BASE/inventory/movements" \\
  -H "X-API-Key: $CLAVE" -H "Content-Type: application/json" \\
  -d '{"inventoryItemId":"<uuid>","movementType":"IN","quantity":10,"reason":"Recepción OC-4471"}'`}</Code>
          </section>

          <section className="api-docs-help">
            <h2>¿Necesitas una credencial?</h2>
            <p>
              Las emite un administrador del laboratorio desde el módulo Integraciones. Si eres
              proveedor externo, pídesela a tu contacto en la institución indicando qué alcances
              necesitas y para qué.
            </p>
          </section>
        </div>
      </div>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <BrandLogo compact />
          <p>Sistema de gestión de laboratorio · Operación clara y trazable.</p>
          <DeveloperCredit />
          <Link href="/login">Ingresar</Link>
        </div>
      </footer>
    </main>
  );
}
