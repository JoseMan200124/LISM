# Servidor MCP de NexaLab

NexaLab expone un servidor **MCP** (Model Context Protocol) en `/api/mcp`. Sirve
para que un asistente de IA —Claude u otro cliente compatible— pueda analizar
cualquier sección del laboratorio y, si se le conceden alcances de escritura,
operar sobre ella: registrar movimientos de existencia, eventos de equipo,
incidencias, recepciones o resultados.

Este documento explica cómo conectarlo y qué garantías tiene. El contrato REST
equivalente está en [`INTEGRATION_API.md`](./INTEGRATION_API.md).

---

## Qué es, en una frase

El servidor MCP es el **gateway de integración hablando otro idioma**. Las mismas
credenciales, los mismos alcances, el mismo límite de llamadas, la misma
bitácora y —sobre todo— los mismos handlers. Un movimiento de inventario creado
por un agente pasa exactamente por donde pasa uno creado desde la pantalla.

```
                    ┌───────────────────────────┐
  ERP / SAP ───────▶│  /api/v1   (REST)         │─┐
                    └───────────────────────────┘ │   ┌────────────────────┐
                                                  ├──▶│ handlers de la app │
                    ┌───────────────────────────┐ │   │ Zod · permisos ·   │
  Claude  ─────────▶│  /api/mcp  (JSON-RPC MCP) │─┘   │ bitácora · webhooks│
                    └───────────────────────────┘     └────────────────────┘
```

No hay una segunda implementación de nada. Añadir una operación al catálogo
(`lib/integration-catalog.ts`) la publica en los dos sitios el mismo día.

---

## Conectar un asistente

### 1. Emitir la credencial

En NexaLab, módulo **Integraciones → Credenciales → Nueva**:

- **Tipo de sistema:** `Asistente de IA (MCP)`.
- **Alcances:** el tipo trae preseleccionada la **lectura de todos los módulos**.
  Es deliberado: el asistente puede analizar el laboratorio entero desde el
  primer minuto, y la escritura se concede a mano cuando se decide
  conscientemente.
- **Responsable:** la credencial se emite a nombre de quien la crea. Sus permisos
  son el techo de lo que el asistente podrá hacer.

El secreto (`nxk_live_…`) se muestra **una sola vez**.

### 2. Añadir el servidor

**Claude Code:**

```bash
claude mcp add --transport http nexalab https://<tu-instancia>/api/mcp \
  --header "Authorization: Bearer nxk_live_…"
```

**Clientes con `mcp.json`** (Claude Desktop y compatibles):

```json
{
  "mcpServers": {
    "nexalab": {
      "type": "http",
      "url": "https://<tu-instancia>/api/mcp",
      "headers": { "Authorization": "Bearer nxk_live_…" }
    }
  }
}
```

También se acepta `X-API-Key: nxk_live_…`, y los tokens OAuth2 de vida corta que
emite `POST /api/v1/oauth/token` con `grant_type=client_credentials`.

### 3. Comprobar

Pídele al asistente que llame a `nexalab_whoami`. Debe responder con el nombre
del laboratorio, los alcances concedidos y cuántas herramientas tiene
disponibles.

---

## Las herramientas

### Dos propias del servidor

| Herramienta | Para qué |
|---|---|
| `nexalab_whoami` | Confirma sobre qué laboratorio se trabaja y qué permite la credencial. Conviene que sea la primera llamada. |
| `nexalab_overview` | Recorre de una vez todas las secciones accesibles y devuelve, por cada una, cuántos registros hay y una muestra reciente. Es el punto de partida para analizar el estado general sin encadenar quince consultas. |

### Una por cada operación del catálogo

El resto sale de `lib/integration-catalog.ts`, con el nombre derivado del
identificador de la operación:

| Operación | Herramienta |
|---|---|
| `inventory.items.list` | `nexalab_inventory_items_list` |
| `equipment.events.create` | `nexalab_equipment_events_create` |
| `research.projects.update` | `nexalab_research_projects_update` |

**Solo aparecen las que permite la credencial.** Si no tiene `inventory:write`,
esa herramienta no existe para ese asistente: no gasta turnos intentando algo que
acabaría en 403, y no propone acciones que la integración tiene prohibidas.

### Forma de los cuerpos

Aquí está la única diferencia real con la API REST. En `/api/v1` los cuerpos se
declaran como objeto abierto, porque al otro lado hay una persona que lee la
documentación, prueba y corrige. Un modelo no tiene ese ciclo: si no sabe los
campos de antemano, inventa nombres plausibles y falla.

Por eso las herramientas MCP publican el **esquema real**, convertido desde el
mismo Zod que valida el handler:

```jsonc
// inputSchema.body de nexalab_equipment_events_create
{
  "type": "object",
  "properties": {
    "equipmentId": { "type": "string", "pattern": "^[0-9a-f]{8}-…$" },
    "eventType": { "enum": ["VERIFICATION", "MAINTENANCE", "CALIBRATION", "REPAIR", "CLEANING"] },
    "details": { "type": "string", "minLength": 3, "maxLength": 2000 }
  },
  "required": ["equipmentId", "eventType", "details"]
}
```

No es una copia: es el objeto Zod del handler importado y convertido en tiempo de
ejecución. Si mañana un campo pasa a ser obligatorio, la herramienta lo anuncia
ese mismo día sin que nadie toque `lib/mcp-body-schemas.ts`. Una prueba falla si
se añade una operación de escritura sin enlazar su esquema.

---

## Garantías

- **Un agente no puede hacer más que una persona.** Los permisos efectivos son la
  intersección de los alcances de la credencial con lo que puede el usuario
  responsable. Si esa persona pierde acceso al laboratorio, el asistente se
  apaga con ella.
- **Todo queda en la bitácora**, atribuido a esa persona y con el canal
  identificado (`NexaLab-MCP/…` en el user-agent). Una acción por MCP y la misma
  por pantalla se distinguen y ninguna es anónima.
- **Mismas reglas de negocio.** Un permiso vencido rechaza la recepción también
  por MCP; una solicitud con material controlado sigue exigiendo licencia. El
  servidor MCP no contiene una sola regla propia.
- **Mismo límite de llamadas** por credencial y por minuto.
- **Los errores de validación llegan enteros**, con la ruta y el motivo de cada
  campo, para que el modelo corrija y reintente en el mismo turno.
- **Los webhooks siguen disparándose**: se lanzan desde `writeAuditEvent`, así
  que lo que haga un agente notifica al ERP igual que lo demás.

---

## Detalles del protocolo

- **Transporte:** Streamable HTTP en modo de respuesta JSON. `POST /api/mcp` con
  un mensaje JSON-RPC 2.0 y respuesta inmediata.
- **`GET /api/mcp` devuelve 405**, tal como pide la especificación cuando el
  servidor no abre canal de eventos. Este no emite nada por su cuenta: no hay
  notificaciones de servidor, muestreo ni progreso.
- **Versiones:** se negocia en `initialize`. Se admiten `2025-06-18`,
  `2025-03-26` y `2024-11-05`.
- **Métodos:** `initialize`, `tools/list`, `tools/call`, `ping` y las
  notificaciones. `resources/*` y `prompts/*` responden `-32601`: este servidor
  solo expone herramientas.
- **Paginación:** las consultas devuelven 50 registros por omisión —una ventana
  de contexto no es un ERP— con un bloque `pagination` que dice cuántos hay en
  total. Se puede pedir más con `limit` y `offset`.
- **Fallos de herramienta** se devuelven como resultado con `isError: true`, no
  como error de protocolo: muchos clientes tratan un error JSON-RPC como avería
  y cortan la conversación.

### Comprobación manual

```bash
curl -s -X POST https://<tu-instancia>/api/mcp \
  -H "Authorization: Bearer nxk_live_…" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools | length'
```

---

## Dónde vive cada cosa

| Archivo | Responsabilidad |
|---|---|
| `app/api/mcp/route.ts` | Endpoint: credencial, límite de llamadas, telemetría. |
| `lib/mcp-protocol.ts` | Capa JSON-RPC: `initialize`, `tools/*`, notificaciones. |
| `lib/mcp-server.ts` | Ejecución sobre el registry, `whoami` y `overview`. |
| `lib/mcp-tools.ts` | Traducción del catálogo a herramientas. |
| `lib/mcp-body-schemas.ts` | Enlace con los Zod de los handlers. |
| `lib/integration-pagination.ts` | Recorte de colecciones, compartido con REST. |

El protocolo se implementa a mano en lugar de traer el SDK oficial porque su
transporte HTTP está escrito contra el `req`/`res` de Node, que no es lo que
recibe un route handler de Next. Adaptarlo habría costado más código del que hay
en `lib/mcp-protocol.ts`, y una dependencia más en la imagen de producción.
