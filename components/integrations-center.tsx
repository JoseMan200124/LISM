"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Ban, BookOpen, Boxes, Download, KeyRound, Plus, RefreshCw, Send, Webhook } from "lucide-react";
import { ActionModal, ConfirmModal, CopyButton, Toast, useToast } from "@/components/action-kit";
import { formatDateTime } from "@/lib/dates";
import { INTEGRATION_SCOPES, scopeLabels, type IntegrationScope } from "@/lib/integration-scopes";
import { WEBHOOK_EVENT_SUGGESTIONS } from "@/lib/integration-events";
import type { UserSession } from "@/lib/session";

// Panel del módulo Integraciones: donde se emite la credencial que usará el
// ERP, se registran los avisos salientes y se descarga el contrato de la API.

type ApiClient = {
  id: string;
  name: string;
  description: string | null;
  system_kind: string;
  client_id: string;
  key_prefix: string;
  scopes: IntegrationScope[] | string;
  rate_limit_per_minute: number;
  status: string;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  actor_name: string | null;
  request_count: number | string;
};

type WebhookEndpoint = {
  id: string;
  name: string;
  target_url: string;
  event_types: string[] | string;
  status: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  consecutive_failures: number;
  created_at: string;
};

type Delivery = {
  id: string;
  endpoint_name: string;
  event_type: string;
  status: string;
  attempts: number;
  response_status: number | null;
  last_error: string | null;
  created_at: string;
};

const SYSTEM_KINDS: Array<{ value: string; label: string }> = [
  { value: "AI_ASSISTANT", label: "Asistente de IA (MCP)" },
  { value: "ERP", label: "ERP" },
  { value: "SAP", label: "SAP" },
  { value: "POWER_APPS", label: "Power Apps / Power Automate" },
  { value: "IPAAS", label: "Plataforma de integración" },
  { value: "CUSTOM", label: "Desarrollo propio" },
  { value: "GENERIC", label: "Otro" },
];

// Conjuntos de partida por sistema: casi nadie sabe qué alcances pedir la
// primera vez, y empezar por lo mínimo razonable evita credenciales que lo
// pueden todo "por si acaso".
const SCOPE_PRESETS: Record<string, IntegrationScope[]> = {
  // Un asistente de IA arranca en solo lectura a propósito. Puede analizar todo
  // el laboratorio desde el primer minuto, y quien lo conecta decide después,
  // marcándolo a mano, si además le deja escribir. Conceder escritura sobre
  // reactivos controlados o resultados sin esa decisión consciente sería
  // regalar la parte del sistema que tiene consecuencias regulatorias.
  AI_ASSISTANT: [
    "inventory:read", "equipment:read", "specimens:read", "results:read",
    "purchasing:read", "compliance:read", "incidents:read", "alerts:read",
    "education:read", "research:read", "quality:read", "catalog:read", "audit:read",
  ],
  ERP: ["inventory:read", "inventory:write", "purchasing:read", "purchasing:write", "catalog:read"],
  SAP: ["inventory:read", "purchasing:read", "purchasing:write", "compliance:read", "catalog:read"],
  POWER_APPS: ["inventory:read", "equipment:read", "incidents:read", "incidents:write", "catalog:read"],
  IPAAS: ["inventory:read", "purchasing:read", "catalog:read"],
  CUSTOM: ["inventory:read", "catalog:read"],
  GENERIC: ["inventory:read", "catalog:read"],
};

function toArray(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

// `session` llega opcional porque así la declara ModuleView; en la práctica
// siempre viene resuelta desde la página del módulo.
export function IntegrationsCenter({ session }: Readonly<{ session?: UserSession }>) {
  const [tab, setTab] = useState<"clients" | "webhooks" | "connect">("clients");
  // La URL del servidor MCP depende de dónde esté desplegada la instancia, y
  // solo el navegador la conoce. Se resuelve tras montar para que el servidor y
  // el cliente rendericen lo mismo y React no descarte el árbol por hidratación.
  const [mcpUrl, setMcpUrl] = useState("https://<tu-instancia>/api/mcp");
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [creatingClient, setCreatingClient] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientDescription, setClientDescription] = useState("");
  const [systemKind, setSystemKind] = useState("ERP");
  const [scopes, setScopes] = useState<IntegrationScope[]>(SCOPE_PRESETS.ERP);
  const [rateLimit, setRateLimit] = useState("120");
  const [issuedSecret, setIssuedSecret] = useState<{ name: string; clientId: string; secret: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<ApiClient | null>(null);

  const [creatingHook, setCreatingHook] = useState(false);
  const [hookName, setHookName] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [hookEvents, setHookEvents] = useState<string[]>(["INVENTORY_*"]);
  const [hookSecret, setHookSecret] = useState<{ name: string; secret: string } | null>(null);
  const [confirmDeleteHook, setConfirmDeleteHook] = useState<WebhookEndpoint | null>(null);

  const { message, toastType, showToast, showError, clearToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [clientsResponse, hooksResponse] = await Promise.all([
        fetch("/api/integrations/clients"),
        fetch("/api/integrations/webhooks"),
      ]);
      if (clientsResponse.ok) {
        const payload = await clientsResponse.json() as { data?: ApiClient[] };
        setClients(payload.data ?? []);
      }
      if (hooksResponse.ok) {
        const payload = await hooksResponse.json() as { data?: { endpoints?: WebhookEndpoint[]; deliveries?: Delivery[] } };
        setEndpoints(payload.data?.endpoints ?? []);
        setDeliveries(payload.data?.deliveries ?? []);
      }
    } catch {
      showError("No se pudo cargar la configuración de integraciones.");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setMcpUrl(`${window.location.origin}/api/mcp`); }, []);

  function applyPreset(kind: string) {
    setSystemKind(kind);
    setScopes(SCOPE_PRESETS[kind] ?? SCOPE_PRESETS.GENERIC);
  }

  function toggleScope(scope: IntegrationScope) {
    setScopes((current) => (current.includes(scope) ? current.filter((entry) => entry !== scope) : [...current, scope]));
  }

  function toggleEvent(pattern: string) {
    setHookEvents((current) => (current.includes(pattern) ? current.filter((entry) => entry !== pattern) : [...current, pattern]));
  }

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (scopes.length === 0) { showError("Elige al menos un alcance para la credencial."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/integrations/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: clientName,
          description: clientDescription || undefined,
          systemKind,
          scopes,
          rateLimitPerMinute: Number(rateLimit) || 120,
        }),
      });
      const payload = await response.json() as { data?: { client_id: string; secret: string }; message?: string };
      if (!response.ok) throw new Error(payload.message || "No se pudo crear la credencial.");
      setCreatingClient(false);
      setIssuedSecret({
        name: clientName,
        clientId: payload.data?.client_id ?? "",
        secret: payload.data?.secret ?? "",
      });
      setClientName(""); setClientDescription("");
      await load();
    } catch (reason) {
      showError(reason instanceof Error ? reason.message : "No se pudo crear la credencial.");
    } finally {
      setSaving(false);
    }
  }

  async function revokeClient(client: ApiClient) {
    try {
      const response = await fetch(`/api/integrations/clients/${client.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      showToast(`Credencial "${client.name}" revocada.`);
      await load();
    } catch {
      showError("No se pudo revocar la credencial.");
    } finally {
      setConfirmRevoke(null);
    }
  }

  async function rotateClient(client: ApiClient) {
    try {
      const response = await fetch(`/api/integrations/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotate: true }),
      });
      const payload = await response.json() as { data?: { client_id: string; secret: string }; message?: string };
      if (!response.ok) throw new Error(payload.message || "No se pudo rotar el secreto.");
      setIssuedSecret({
        name: client.name,
        clientId: payload.data?.client_id ?? "",
        secret: payload.data?.secret ?? "",
      });
      await load();
    } catch (reason) {
      showError(reason instanceof Error ? reason.message : "No se pudo rotar el secreto.");
    }
  }

  async function createWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hookEvents.length === 0) { showError("Elige al menos un evento al que suscribirse."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/integrations/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: hookName, targetUrl: hookUrl, eventTypes: hookEvents }),
      });
      const payload = await response.json() as { data?: { signingSecret: string }; message?: string };
      if (!response.ok) throw new Error(payload.message || "No se pudo registrar el webhook.");
      setCreatingHook(false);
      setHookSecret({ name: hookName, secret: payload.data?.signingSecret ?? "" });
      setHookName(""); setHookUrl("");
      await load();
    } catch (reason) {
      showError(reason instanceof Error ? reason.message : "No se pudo registrar el webhook.");
    } finally {
      setSaving(false);
    }
  }

  async function testWebhook(endpoint: WebhookEndpoint) {
    showToast(`Enviando evento de prueba a "${endpoint.name}"…`);
    try {
      const response = await fetch(`/api/integrations/webhooks/${endpoint.id}/test`, { method: "POST" });
      const payload = await response.json() as { data?: { delivered: boolean; delivery?: { response_status: number | null; last_error: string | null } } };
      if (payload.data?.delivered) showToast(`"${endpoint.name}" respondió correctamente.`);
      else showError(payload.data?.delivery?.last_error ?? "El destino no aceptó el evento de prueba.");
      await load();
    } catch {
      showError("No se pudo enviar el evento de prueba.");
    }
  }

  async function toggleWebhook(endpoint: WebhookEndpoint) {
    const next = endpoint.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const response = await fetch(`/api/integrations/webhooks/${endpoint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) throw new Error();
      showToast(next === "ACTIVE" ? "Webhook reactivado." : "Webhook en pausa.");
      await load();
    } catch {
      showError("No se pudo cambiar el estado del webhook.");
    }
  }

  async function deleteWebhook(endpoint: WebhookEndpoint) {
    try {
      const response = await fetch(`/api/integrations/webhooks/${endpoint.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      showToast(`Webhook "${endpoint.name}" eliminado.`);
      await load();
    } catch {
      showError("No se pudo eliminar el webhook.");
    } finally {
      setConfirmDeleteHook(null);
    }
  }

  async function retryPending() {
    try {
      const response = await fetch("/api/integrations/webhooks/retry", { method: "POST" });
      const payload = await response.json() as { data?: { attempted: number; delivered: number } };
      showToast(`Reintentos: ${payload.data?.delivered ?? 0} entregados de ${payload.data?.attempted ?? 0}.`);
      await load();
    } catch {
      showError("No se pudieron reintentar las entregas.");
    }
  }

  return (
    <div className="page-stack">
      <Toast message={message} type={toastType} onClose={clearToast} />

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Integraciones</h2>
            <p>
              Conecta los módulos de NexaLab con el ERP, SAP, Power Apps u otros sistemas de la
              institución. Las credenciales que emitas aquí quedan limitadas al laboratorio
              <strong> {session?.laboratoryName ?? "activo"}</strong>.
            </p>
          </div>
          <div className="empty-state-actions">
            <button type="button" className={tab === "clients" ? "primary-button" : "secondary-button"} onClick={() => setTab("clients")}>
              <KeyRound size={16} /> Credenciales
            </button>
            <button type="button" className={tab === "webhooks" ? "primary-button" : "secondary-button"} onClick={() => setTab("webhooks")}>
              <Webhook size={16} /> Webhooks
            </button>
            <button type="button" className={tab === "connect" ? "primary-button" : "secondary-button"} onClick={() => setTab("connect")}>
              <Boxes size={16} /> Cómo conectar
            </button>
          </div>
        </div>
      </section>

      {tab === "clients" && (
        <section className="panel table-panel module-table-panel">
          <div className="section-heading">
            <div>
              <h3>Credenciales de acceso</h3>
              <p>
                Cada credencial identifica a un sistema externo. Sus permisos son los tuyos
                recortados por los alcances que le concedas: nunca puede hacer más que la persona
                que la emitió.
              </p>
            </div>
            <button type="button" className="primary-button" onClick={() => setCreatingClient(true)}>
              <Plus size={16} /> Nueva credencial
            </button>
          </div>

          {loading ? <p className="form-help">Cargando…</p> : clients.length === 0 ? (
            <p className="form-help">
              Todavía no hay credenciales. Crea una para que un sistema externo pueda leer o
              escribir en este laboratorio.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nombre</th><th>Sistema</th><th>Clave</th><th>Alcances</th>
                  <th>Llamadas</th><th>Último uso</th><th>Estado</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <strong>{client.name}</strong>
                      {client.description ? <div className="form-help">{client.description}</div> : null}
                      {client.actor_name ? <div className="form-help">Responsable: {client.actor_name}</div> : null}
                    </td>
                    <td>{SYSTEM_KINDS.find((kind) => kind.value === client.system_kind)?.label ?? client.system_kind}</td>
                    <td><code>{client.key_prefix}…</code></td>
                    <td>{toArray(client.scopes).length} alcances</td>
                    <td>{Number(client.request_count ?? 0)}</td>
                    <td>{client.last_used_at ? formatDateTime(client.last_used_at) : "Sin usar"}</td>
                    <td><span className="status-pill">{client.status === "ACTIVE" ? "Activa" : "Revocada"}</span></td>
                    <td>
                      {client.status === "ACTIVE" ? (
                        <div className="empty-state-actions">
                          <button type="button" className="secondary-button" onClick={() => void rotateClient(client)}>
                            <RefreshCw size={14} /> Rotar
                          </button>
                          <button type="button" className="secondary-button" onClick={() => setConfirmRevoke(client)}>
                            <Ban size={14} /> Revocar
                          </button>
                        </div>
                      ) : <span className="form-help">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "webhooks" && (
        <>
          <section className="panel table-panel module-table-panel">
            <div className="section-heading">
              <div>
                <h3>Avisos hacia sistemas externos</h3>
                <p>
                  NexaLab llama a estas direcciones cuando ocurre algo en el laboratorio, firmando
                  cada envío. Así el ERP se entera al momento en lugar de preguntar cada rato.
                </p>
              </div>
              <div className="empty-state-actions">
                <button type="button" className="secondary-button" onClick={() => void retryPending()}>
                  <RefreshCw size={16} /> Reintentar pendientes
                </button>
                <button type="button" className="primary-button" onClick={() => setCreatingHook(true)}>
                  <Plus size={16} /> Nuevo webhook
                </button>
              </div>
            </div>

            {loading ? <p className="form-help">Cargando…</p> : endpoints.length === 0 ? (
              <p className="form-help">No hay webhooks registrados.</p>
            ) : (
              <table>
                <thead>
                  <tr><th>Nombre</th><th>Destino</th><th>Eventos</th><th>Último éxito</th><th>Fallos seguidos</th><th>Estado</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {endpoints.map((endpoint) => (
                    <tr key={endpoint.id}>
                      <td><strong>{endpoint.name}</strong></td>
                      <td><code>{endpoint.target_url}</code></td>
                      <td>{toArray(endpoint.event_types).join(", ")}</td>
                      <td>{endpoint.last_success_at ? formatDateTime(endpoint.last_success_at) : "Nunca"}</td>
                      <td>{endpoint.consecutive_failures}</td>
                      <td><span className="status-pill">{endpoint.status === "ACTIVE" ? "Activo" : "En pausa"}</span></td>
                      <td>
                        <div className="empty-state-actions">
                          <button type="button" className="secondary-button" onClick={() => void testWebhook(endpoint)}>
                            <Send size={14} /> Probar
                          </button>
                          <button type="button" className="secondary-button" onClick={() => void toggleWebhook(endpoint)}>
                            {endpoint.status === "ACTIVE" ? "Pausar" : "Reactivar"}
                          </button>
                          <button type="button" className="secondary-button" onClick={() => setConfirmDeleteHook(endpoint)}>
                            <Ban size={14} /> Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel table-panel module-table-panel">
            <div className="section-heading">
              <div>
                <h3>Últimas entregas</h3>
                <p>El registro de lo que se envió y cómo respondió cada destino.</p>
              </div>
            </div>
            {deliveries.length === 0 ? <p className="form-help">Todavía no se ha enviado ningún evento.</p> : (
              <table>
                <thead>
                  <tr><th>Momento</th><th>Destino</th><th>Evento</th><th>Intentos</th><th>Respuesta</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {deliveries.map((delivery) => (
                    <tr key={delivery.id}>
                      <td>{formatDateTime(delivery.created_at)}</td>
                      <td>{delivery.endpoint_name}</td>
                      <td><code>{delivery.event_type}</code></td>
                      <td>{delivery.attempts}</td>
                      <td>
                        {delivery.response_status ?? "—"}
                        {delivery.last_error ? <div className="form-help">{delivery.last_error}</div> : null}
                      </td>
                      <td><span className="status-pill">{delivery.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {tab === "connect" && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>Cómo conectar cada sistema</h3>
              <p>Descarga el contrato de la API y sigue la ruta que corresponda a tu plataforma.</p>
            </div>
            <div className="empty-state-actions">
              <a className="primary-button" href="/docs/api" target="_blank" rel="noreferrer">
                <BookOpen size={16} /> Documentación técnica
              </a>
              <a className="secondary-button" href="/api/v1/openapi" target="_blank" rel="noreferrer">
                <Download size={16} /> OpenAPI 3.1
              </a>
              <a className="secondary-button" href="/api/v1/openapi/powerapps" target="_blank" rel="noreferrer">
                <Download size={16} /> Conector de Power Apps
              </a>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: "1.25rem" }}>
            <h4>Asistentes de IA (Claude y cualquier cliente MCP)</h4>
            <p className="form-help">
              NexaLab expone un servidor <strong>MCP</strong> en <code>{mcpUrl}</code>. Un asistente
              conectado ahí puede analizar cualquier sección del laboratorio y, si le concedes
              alcances de escritura, registrar movimientos, eventos de equipo o incidencias. Emite
              una credencial del tipo <em>Asistente de IA</em> y ejecuta:
            </p>
            <pre className="api-docs-code">
              <code>{`claude mcp add --transport http nexalab ${mcpUrl} \\\n  --header "Authorization: Bearer nxk_live_…"`}</code>
            </pre>
            <p className="form-help">
              El asistente solo ve las herramientas que permiten sus alcances, todo lo que haga queda
              en la bitácora a nombre de la persona responsable de la credencial, y nunca puede hacer
              más que esa persona. Empieza en solo lectura y amplía cuando lo tengas claro.
            </p>
          </div>

          <div className="details-grid">
            <div>
              <h4>Power Apps y Power Automate</h4>
              <p className="form-help">
                Descarga el archivo del conector, entra a <em>Conectores personalizados → Nuevo →
                Importar un archivo OpenAPI</em> y súbelo. Cuando pida la autenticación, elige
                <strong> Clave de API</strong> con el encabezado <code>X-API-Key</code> y pega la
                clave que emitiste aquí.
              </p>
            </div>
            <div>
              <h4>SAP y plataformas corporativas</h4>
              <p className="form-help">
                Usa OAuth2 de tipo <code>client_credentials</code> contra
                <code> /api/v1/oauth/token</code> con el <code>client_id</code> y el secreto de la
                credencial. El token dura una hora y se renueva solo.
              </p>
            </div>
            <div>
              <h4>ERP u otros sistemas</h4>
              <p className="form-help">
                Basta con enviar la cabecera <code>X-API-Key</code> en cada llamada. Empieza por
                <code> GET /api/v1/me</code>: confirma que la credencial funciona y devuelve la
                lista exacta de operaciones que tiene permitidas.
              </p>
            </div>
            <div>
              <h4>Recibir avisos</h4>
              <p className="form-help">
                Registra un webhook en la pestaña anterior. Cada envío lleva la cabecera
                <code> x-nexalab-signature</code> con un HMAC-SHA256 de
                <code> timestamp.cuerpo</code>: valídala antes de procesar el evento.
              </p>
            </div>
          </div>
        </section>
      )}

      <ActionModal
        open={creatingClient}
        title="Nueva credencial de integración"
        description="Identifica el sistema que se va a conectar y concede solo los alcances que necesita."
        onClose={() => setCreatingClient(false)}
        wide
      >
        <form className="modal-form" onSubmit={createClient}>
          <div className="form-grid form-grid-two">
            <label>
              Nombre
              <input value={clientName} onChange={(event) => setClientName(event.target.value)} required minLength={3} maxLength={160} placeholder="ERP de compras" />
            </label>
            <label>
              Sistema
              <select value={systemKind} onChange={(event) => applyPreset(event.target.value)}>
                {SYSTEM_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
              </select>
            </label>
            <label className="field-span-two">
              Descripción
              <input value={clientDescription} onChange={(event) => setClientDescription(event.target.value)} maxLength={500} placeholder="Para qué se usará esta credencial" />
            </label>
            <label>
              Límite de llamadas por minuto
              <input type="number" min={10} max={6000} value={rateLimit} onChange={(event) => setRateLimit(event.target.value)} />
            </label>
          </div>

          <p className="form-section-title">Alcances concedidos</p>
          <p className="form-help">
            Se preseleccionaron los habituales para ese sistema. Los permisos reales serán estos
            cruzados con los tuyos.
          </p>
          <div className="check-line">
            {INTEGRATION_SCOPES.map((scope) => (
              <label key={scope} className="filter-chip">
                <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
                {scopeLabels[scope]}
              </label>
            ))}
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setCreatingClient(false)}>Cancelar</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? "Creando…" : "Crear credencial"}</button>
          </div>
        </form>
      </ActionModal>

      <ActionModal
        open={Boolean(issuedSecret)}
        title="Guarda esta clave ahora"
        description="Es la única vez que se muestra. NexaLab solo guarda su huella; si se pierde, hay que rotarla."
        onClose={() => setIssuedSecret(null)}
        wide
      >
        <div className="modal-form">
          <p className="form-section-title">{issuedSecret?.name}</p>
          <label>
            client_id
            <input readOnly value={issuedSecret?.clientId ?? ""} />
          </label>
          <label>
            Clave secreta
            <input readOnly value={issuedSecret?.secret ?? ""} />
          </label>
          <div className="modal-actions">
            <CopyButton text={issuedSecret?.secret ?? ""} onCopied={() => showToast("Clave copiada.")} />
            <button type="button" className="primary-button" onClick={() => setIssuedSecret(null)}>Ya la guardé</button>
          </div>
        </div>
      </ActionModal>

      <ActionModal
        open={creatingHook}
        title="Nuevo webhook"
        description="NexaLab enviará una petición firmada a esta dirección cuando ocurra alguno de los eventos elegidos."
        onClose={() => setCreatingHook(false)}
        wide
      >
        <form className="modal-form" onSubmit={createWebhook}>
          <div className="form-grid form-grid-two">
            <label>
              Nombre
              <input value={hookName} onChange={(event) => setHookName(event.target.value)} required minLength={3} maxLength={160} placeholder="Avisos al ERP" />
            </label>
            <label>
              Dirección de destino
              <input value={hookUrl} onChange={(event) => setHookUrl(event.target.value)} required placeholder="https://erp.institucion.com/hooks/nexalab" />
            </label>
          </div>
          <p className="form-help">Debe ser HTTPS y estar accesible desde internet.</p>

          <p className="form-section-title">Eventos</p>
          <div className="check-line">
            {WEBHOOK_EVENT_SUGGESTIONS.map((suggestion) => (
              <label key={suggestion.pattern} className="filter-chip">
                <input type="checkbox" checked={hookEvents.includes(suggestion.pattern)} onChange={() => toggleEvent(suggestion.pattern)} />
                {suggestion.label}
              </label>
            ))}
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setCreatingHook(false)}>Cancelar</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? "Registrando…" : "Registrar webhook"}</button>
          </div>
        </form>
      </ActionModal>

      <ActionModal
        open={Boolean(hookSecret)}
        title="Secreto de firma del webhook"
        description="Compártelo con quien reciba los eventos: lo necesita para verificar que el aviso viene de NexaLab."
        onClose={() => setHookSecret(null)}
      >
        <div className="modal-form">
          <label>
            Secreto
            <input readOnly value={hookSecret?.secret ?? ""} />
          </label>
          <p className="form-help">
            La firma viaja en <code>x-nexalab-signature</code> como <code>v1=HMAC-SHA256(secreto,
            &quot;timestamp.cuerpo&quot;)</code>.
          </p>
          <div className="modal-actions">
            <CopyButton text={hookSecret?.secret ?? ""} onCopied={() => showToast("Secreto copiado.")} />
            <button type="button" className="primary-button" onClick={() => setHookSecret(null)}>Listo</button>
          </div>
        </div>
      </ActionModal>

      <ConfirmModal
        open={Boolean(confirmRevoke)}
        title="Revocar credencial"
        description={`El sistema "${confirmRevoke?.name ?? ""}" dejará de tener acceso de inmediato. El historial de sus llamadas se conserva.`}
        confirmLabel="Revocar"
        onConfirm={() => { if (confirmRevoke) void revokeClient(confirmRevoke); }}
        onClose={() => setConfirmRevoke(null)}
      />

      <ConfirmModal
        open={Boolean(confirmDeleteHook)}
        title="Eliminar webhook"
        description={`Se dejarán de enviar eventos a "${confirmDeleteHook?.name ?? ""}".`}
        confirmLabel="Eliminar"
        onConfirm={() => { if (confirmDeleteHook) void deleteWebhook(confirmDeleteHook); }}
        onClose={() => setConfirmDeleteHook(null)}
      />
    </div>
  );
}
