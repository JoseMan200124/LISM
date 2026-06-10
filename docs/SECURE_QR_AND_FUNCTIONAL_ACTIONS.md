# Etiquetas QR seguras y controles funcionales

## Objetivo

Cada reactivo, material o equipo puede disponer de una etiqueta QR única e imprimible. La etiqueta solamente contiene una URL con un token opaco. No incorpora el nombre, el lote, la ubicación ni información sensible.

## Flujo de consulta

1. Un usuario autorizado entra a **Inventario → QR y etiquetas** o **Equipos → QR**.
2. Selecciona la etiqueta y puede imprimirla para pegarla físicamente al recurso.
3. Cuando una persona necesita consultar el recurso, un usuario autorizado genera un código temporal de seis dígitos.
4. La persona escanea el QR e ingresa el código.
5. El código vence a los 10 minutos, se consume después del primer uso y se bloquea después de cinco intentos fallidos.
6. Se muestra una ficha segura con ubicación, estado, resumen e historial reciente.

## Seguridad

- `qr_identifiers.opaque_token` es un identificador aleatorio y no reversible.
- `qr_access_codes.code_hash` almacena un HMAC; el código de seis dígitos nunca se persiste en texto plano.
- Cada código temporal se revoca cuando se genera uno nuevo.
- `qr_scan_events` registra accesos permitidos y denegados.
- Las acciones que modifican información se mantienen dentro del portal autenticado.
- En modo demostración sin base de datos, los códigos temporales se almacenan únicamente en memoria para validar el flujo local. Para producción debe configurarse PostgreSQL y ejecutarse `database/0006_secure_qr_labels.sql`.

## Instalación

```bash
psql "$DIRECT_URL" -f database/0006_secure_qr_labels.sql
```

Configurar también:

```text
NEXT_PUBLIC_APP_URL=https://tu-dominio.example
QR_ACCESS_SECRET=una-clave-larga-distinta-a-la-de-sesion
```

## Endpoints

| Endpoint | Uso |
| --- | --- |
| `GET /api/qr/labels?entityType=INVENTORY_ITEM` | Listar etiquetas autorizadas |
| `POST /api/qr/labels` | Generar o reactivar una etiqueta única |
| `POST /api/qr/labels/:id/access-code` | Crear código temporal de un solo uso |
| `GET /api/qr/image/:token` | Renderizar SVG imprimible |
| `POST /api/public/qr/:token/verify` | Consumir código temporal y devolver ficha segura |
| `GET /qr/:token` | Pantalla móvil de consulta protegida |

## Persistencia de evidencias

Los formularios de certificados y eventos registran el metadato trazable mediante API. El archivo binario no se guarda dentro de PostgreSQL: debe enviarse a object storage mediante el adaptador del despliegue y asociarse mediante la tabla `attachments`.
