# API de integración de NexaLab

Cómo conectar los módulos de NexaLab con un ERP, SAP, Power Apps u otros
sistemas de la institución.

---

## 1. En una página

NexaLab expone dos caminos, y una integración completa suele usar los dos:

| Dirección | Qué es | Para qué sirve |
|---|---|---|
| **De fuera hacia dentro** | Gateway REST en `/api/v1` | El ERP consulta existencias, crea solicitudes de compra, registra recepciones. |
| **De dentro hacia fuera** | Webhooks firmados | NexaLab avisa al ERP en el momento en que algo ocurre, sin que tenga que preguntar. |

La puerta de entrada es una **credencial** que se emite desde la propia
aplicación: módulo **Integraciones → Credenciales → Nueva credencial**. Requiere
permiso de administración (`configuration.manage`).

---

## 2. El modelo de seguridad, y por qué es así

Tres reglas gobiernan todo lo que sigue:

1. **Una credencial pertenece a un laboratorio.** Una institución con tres
   laboratorios emite tres credenciales. El alcance nunca es ambiguo.

2. **Una credencial nunca puede hacer más que una persona identificable.** Sus
   permisos efectivos son la *intersección* de dos cosas: los alcances (scopes)
   concedidos, y lo que puede hacer hoy el usuario responsable de la credencial
   —normalmente quien la emitió—. Conceder `inventory:write` a una credencial
   cuyo responsable solo puede leer inventario no habilita nada.

   La consecuencia práctica importa: **si esa persona deja la institución o
   pierde el acceso al laboratorio, la integración deja de funcionar.** Es
   deliberado. Antes de que alguien se vaya, traspase sus credenciales.

3. **Todo queda en la bitácora.** Una solicitud de compra creada por SAP pasa
   por las mismas validaciones, los mismos flujos y el mismo registro de
   auditoría que una creada a mano en la pantalla. No hay un camino "de
   servicio" que se salte reglas: el gateway llama exactamente al mismo código
   que usa la interfaz web.

---

## 3. Autenticación

La misma credencial se puede presentar de dos formas. Elige la que soporte tu
plataforma; no conceden nada distinto.

### Opción A — Clave directa (la más simple)

```http
GET /api/v1/inventory/items
X-API-Key: nxk_live_…
```

También se acepta `Authorization: Bearer nxk_live_…`.

Es lo que usan Power Apps, la mayoría de ERP y cualquier herramienta que sepa
poner una cabecera fija.

### Opción B — OAuth2 client_credentials (para SAP y plataformas corporativas)

```http
POST /api/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=nxc_…&client_secret=nxk_live_…
```

Respuesta:

```json
{
  "access_token": "eyJhbGciOi…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "inventory:read inventory:write purchasing:read"
}
```

El token dura una hora. Se envía como `Authorization: Bearer <access_token>`.
Existe porque muchas plataformas corporativas prohíben almacenar un secreto
permanente en el cliente.

### El secreto se muestra una sola vez

Al crear la credencial, NexaLab enseña el secreto una única vez y guarda solo su
huella (SHA-256). Si se pierde, se **rota** desde el panel: se emite uno nuevo y
el anterior deja de servir en el acto.

---

## 4. Primera llamada: comprueba que todo está bien

```bash
curl -H "X-API-Key: $CLAVE" https://<tu-dominio>/api/v1/me
```

Devuelve el laboratorio, los alcances concedidos, los **permisos que de verdad
quedaron** tras la intersección, y la lista exacta de operaciones disponibles.

Si aquí falta algo que sí concediste, el problema está en los permisos del
usuario responsable, no en la credencial.

---

## 5. Alcances (scopes)

| Alcance | Qué abre |
|---|---|
| `inventory:read` / `inventory:write` | Existencias, artículos, movimientos del kardex |
| `equipment:read` / `equipment:write` | Equipos, planes, calibraciones, certificados |
| `specimens:read` / `specimens:write` | Muestras y su flujo de trabajo |
| `results:read` / `results:write` / `results:approve` | Resultados analíticos |
| `purchasing:read` / `purchasing:write` | Solicitudes de compra |
| `compliance:read` / `compliance:write` | Catálogo de sustancias, licencias, permisos, recepciones, conteos, destrucciones |
| `incidents:read` / `incidents:write` | Incidencias |
| `alerts:read` / `alerts:write` | Alertas y sus reglas |
| `education:read` / `education:write` | Prácticas, reservas y grupos |
| `research:read` / `research:write` | Proyectos, protocolos, muestras, biobanco, cuadernos |
| `quality:read` / `quality:write` | Calidad y fuera de especificación |
| `audit:read` | Bitácora de auditoría |
| `catalog:read` | Datos maestros: categorías y ubicaciones |

Un alcance de escritura incluye siempre su lectura.

**Concede lo mínimo.** Un ERP de compras normalmente necesita
`inventory:read`, `purchasing:read`, `purchasing:write` y `catalog:read`; no
necesita tocar resultados ni firmas.

---

## 6. El contrato de la API

| Formato | URL | Para qué |
|---|---|---|
| OpenAPI 3.1 | `/api/v1/openapi` | SAP, Postman, Azure API Management, generadores de clientes |
| Swagger 2.0 | `/api/v1/openapi/powerapps` | Conectores personalizados de Power Apps y Power Automate |

Ambos se generan desde el mismo registro que atiende las llamadas, así que no
pueden quedar desactualizados respecto de lo que la API realmente hace.

> Se emiten dos formatos porque el importador de conectores de Power Apps solo
> acepta Swagger 2.0. No es una preferencia nuestra, es el límite de esa
> plataforma.

---

## 7. Guías por plataforma

### Power Apps y Power Automate

1. Descarga `/api/v1/openapi/powerapps`.
2. En Power Apps: **Conectores personalizados → Nuevo conector → Importar un
   archivo OpenAPI**, y sube el archivo.
3. En **Seguridad**, elige **Clave de API**:
   - Nombre del parámetro: `X-API-Key`
   - Ubicación: **Encabezado**
4. Crea la conexión pegando la clave emitida en NexaLab.

Cada operación aparece con su nombre y descripción en el diseñador de flujos.

### SAP

Usa el flujo OAuth2 `client_credentials` de la sección 3 (opción B) contra
`/api/v1/oauth/token`. Registra el destino con la URL base
`https://<tu-dominio>/api/v1` y renueva el token cuando expire (una hora).

Para el sentido contrario —que SAP se entere de lo que pasa en el
laboratorio— registra un webhook (sección 8) apuntando al endpoint que exponga
tu middleware.

### Cualquier otro ERP o desarrollo propio

Envía `X-API-Key` en cada llamada. Empieza por `GET /api/v1/me` y usa
`/api/v1/openapi` para generar un cliente.

---

## 8. Webhooks: que el ERP se entere solo

Se registran en **Integraciones → Webhooks**. Cada uno tiene una URL de destino
(HTTPS obligatorio), una lista de eventos y un secreto de firma.

### Eventos

Los eventos son las acciones de la bitácora. Se admiten comodines:

- `*` — todo
- `INVENTORY_*` — todo lo de inventario
- `PURCHASE_REQUEST_CREATED` — solo esa acción

Los más pedidos por integraciones: `INVENTORY_ITEM_CREATED`,
`INVENTORY_MOVEMENT_CREATED`, `INVENTORY_RECEIPT_REGISTERED`,
`PURCHASE_REQUEST_CREATED`, `PURCHASE_REQUEST_UPDATED`,
`EQUIPMENT_EVENT_CREATED`, `CONTROLLED_USAGE_*`, `INCIDENT_*`.

### Forma del envío

```http
POST https://tu-erp.institucion.com/hooks/nexalab
Content-Type: application/json
x-nexalab-event: INVENTORY_ITEM_CREATED
x-nexalab-delivery: 6f1c…
x-nexalab-timestamp: 1753900000
x-nexalab-signature: v1=<hmac-sha256-hex>

{
  "id": "…",              // estable entre reintentos: úsalo para descartar duplicados
  "type": "INVENTORY_ITEM_CREATED",
  "createdAt": "2026-07-30T18:22:11.000Z",
  "data": { "action": "…", "entityType": "…", "entityId": "…", "newValue": { … } }
}
```

### Verificar la firma (obligatorio)

```js
const esperado = "v1=" + crypto
  .createHmac("sha256", SECRETO)
  .update(`${headers["x-nexalab-timestamp"]}.${cuerpoCrudo}`)
  .digest("hex");
// compara con headers["x-nexalab-signature"] usando comparación de tiempo constante
```

Valida siempre sobre el **cuerpo crudo**, antes de parsear el JSON.

### Reintentos

Si el receptor no responde 2xx, NexaLab reintenta hasta 5 veces con espera
creciente (1, 5, 15 y 60 minutos). El historial de cada intento —incluido el
código y el error exacto— está en **Integraciones → Webhooks → Últimas
entregas**, y hay un botón para reintentar los pendientes cuando el ERP vuelve.

Responde 2xx en cuanto recibas el evento y procésalo después: si tardas más de
10 segundos, el envío se da por fallido.

---

## 9. Detalles operativos

**Paginación.** Añade `limit` (1-500, por omisión 100) y `offset` a cualquier
colección; la respuesta incluye un objeto `pagination`.

> El recorte lo hace el gateway sobre el resultado ya consultado: sirve para que
> el ERP no reciba colecciones enormes, pero no reduce el trabajo de la base de
> datos. Cuando una colección crezca lo bastante para que eso importe, la
> paginación bajará a la consulta sin que cambie este contrato.

**Límite de caudal.** Por omisión 120 llamadas por minuto y credencial,
configurable al emitirla. Al superarlo se devuelve `429` con
`retryAfterSeconds`.

> El contador vive en memoria de cada instancia. Con varias réplicas el techo
> efectivo se multiplica por el número de réplicas. Está pensado para frenar un
> cliente desbocado, no como cuota de facturación.

**Errores.** Siempre `{ "error": "<código>", "message": "<explicación>" }`.

| Código | Significado |
|---|---|
| `missing_credentials` (401) | No se envió credencial |
| `invalid_credentials` (401) | Clave o token inválido |
| `revoked` / `expired` (403) | Credencial revocada o vencida |
| `actor_without_access` (403) | El usuario responsable ya no tiene acceso al laboratorio |
| `insufficient_scope` (403) | Falta el alcance; la respuesta dice cuál |
| `rate_limited` (429) | Se superó el límite por minuto |
| `not_found` (404) | La ruta no existe en la API |
| `invalid_json` (400) | El cuerpo no es JSON válido |

Los errores de validación de negocio llegan tal cual del módulo, con
`message` e `issues` señalando los campos.

**Diagnóstico.** Cada respuesta lleva `x-nexalab-request-id` y
`x-nexalab-operation`. Cita el primero al reportar un problema: la llamada queda
registrada con su duración y su resultado.

---

## 10. Ejemplo completo: sincronizar existencias con el ERP

```bash
BASE="https://<tu-dominio>/api/v1"
CLAVE="nxk_live_…"

# 1. Comprobar la credencial
curl -H "X-API-Key: $CLAVE" "$BASE/me"

# 2. Traer el inventario
curl -H "X-API-Key: $CLAVE" "$BASE/inventory/items?limit=200"

# 3. Registrar una entrada de existencia tras recibir una compra
curl -X POST "$BASE/inventory/movements" \
  -H "X-API-Key: $CLAVE" -H "Content-Type: application/json" \
  -d '{"inventoryItemId":"<uuid>","movementType":"IN","quantity":10,"reason":"Recepción OC-4471"}'

# 4. Crear una solicitud de compra desde el ERP
curl -X POST "$BASE/purchasing/requests" \
  -H "X-API-Key: $CLAVE" -H "Content-Type: application/json" \
  -d '{"title":"Reposición de solventes","priority":"NORMAL","items":[…]}'
```

Los campos exactos de cada cuerpo están en el OpenAPI y, sobre todo, en la
respuesta de error: un `400` enumera qué falta.

---

## 11. Notas para quien mantiene esto

- **Añadir una operación** es añadir una entrada en
  `lib/integration-registry.ts` apuntando al handler nativo. El OpenAPI, el
  enrutado y el control de alcances salen solos de ahí. No escribas lógica de
  negocio en el gateway.
- **Los cuerpos se declaran como objeto abierto** en el OpenAPI a propósito: las
  entidades varían por perfil de laboratorio y por los campos personalizados de
  cada institución. Congelar una lista de propiedades produciría un contrato que
  miente en cuanto un laboratorio añade un campo.
- **Los webhooks se disparan desde `writeAuditEvent`**, no desde cada handler.
  Cualquier acción nueva que registre bitácora queda cubierta automáticamente.
- **Filtro de destinos (SSRF).** `lib/integration-admin.ts` bloquea HTTP en
  claro, direcciones privadas y endpoints de metadatos de la nube. Valida el
  nombre del host, no la IP a la que resuelve: un dominio público apuntando a
  una dirección privada pasaría el filtro. Cerrarlo del todo exige resolver DNS
  y volver a comprobar al conectar.
- **El secreto de firma de los webhooks se guarda en claro** porque hace falta
  el original para firmar cada envío (no puede ser un hash). Mismo compromiso
  que Stripe y GitHub.
- **Los tokens OAuth2 se firman con un secreto derivado** del de sesión
  (`HMAC(SESSION_SECRET, "nexalab.integration.v1")`). Que sea distinto impide
  que un token de integración se acepte como cookie de sesión web, o al revés.
