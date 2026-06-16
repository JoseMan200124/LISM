# NexaLab Educativo - CODING_STANDARDS

## 1. Principio central
El código debe mantener el sistema simple, seguro y trazable. No se debe romper la base actual del LISM/NexaLab ni introducir cambios masivos innecesarios para el MVP educativo.

Todo desarrollo debe cumplir tres filtros antes de considerarse listo:

1. Tipado estricto.
2. Validación en fronteras.
3. Autorización y auditoría en acciones críticas.

## 2. TypeScript estricto

### Prohibido

```ts
any
// @ts-ignore
// @ts-expect-error sin justificación
```

### Requerido

- Tipos explícitos para payloads.
- Tipos explícitos para responses.
- Tipos compartidos cuando una entidad se usa en UI y API.
- Usar `unknown` en errores o datos externos y luego validar.

Ejemplo:

```ts
type InventoryCategoryDto = {
  id: string;
  code: string;
  name: string;
  prefix: string;
  status: "ACTIVE" | "INACTIVE";
};
```

## 3. Zod en todas las fronteras

Todo endpoint `POST`, `PATCH`, `PUT` o query crítica debe validar con Zod.

Ejemplo:

```ts
const createCategorySchema = z.object({
  name: z.string().min(2).max(120),
  prefix: z.string().min(2).max(8).regex(/^[A-Z0-9]+$/),
  description: z.string().max(500).optional(),
});
```

No confiar en datos del cliente aunque el formulario ya valide.

## 4. Patrón obligatorio de endpoints

Todos los endpoints deben seguir este orden:

```ts
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  if (!hasPermission(session, "permission.key")) return forbidden();

  const json = await request.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) return validationError(parsed.error.issues);

  const payload = parsed.data;

  if (!hasDatabase()) {
    return demoResponse(payload);
  }

  const sql = getSql();
  const rows = await sql`...`;

  await writeAuditEvent(session, {
    action: "ACTION_NAME",
    entityType: "entity_name",
    entityId: String(rows[0].id),
    newValue: rows[0],
    request,
  });

  return NextResponse.json({ data: rows[0], mode: "database" }, { status: 201 });
}
```

## 5. Early returns

Usar cláusulas de guarda. No crear funciones con anidaciones profundas.

Bueno:

```ts
if (!session) return unauthorized();
if (!canManage) return forbidden();
if (!parsed.success) return validationError(parsed.error.issues);
```

Malo:

```ts
if (session) {
  if (canManage) {
    if (parsed.success) {
      // lógica principal
    }
  }
}
```

## 6. Respuestas JSON consistentes

Usar una estructura consistente:

```json
{
  "data": {},
  "mode": "database"
}
```

Para errores:

```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Datos inválidos.",
  "issues": []
}
```

Si el proyecto todavía usa `{ message }`, mantener compatibilidad, pero para endpoints nuevos preferir estructura estándar.

## 7. Reglas de autorización

Nunca confiar solo en el menú. Aunque una ruta no aparezca, el endpoint debe validar permisos.

Permisos principales:

```ts
"inventory.view"
"inventory.manage"
"inventory.move"
"equipment.view"
"equipment.manage"
"education.view"
"education.manage"
"configuration.manage"
"audit.view"
```

### Reglas por rol

- `LAB_ADMIN`: todo el MVP educativo.
- `PROFESSOR`: prácticas, reservas y consultas.
- `STUDENT`: consulta limitada.

## 8. Auditoría obligatoria

Llamar `writeAuditEvent` en:

- Crear artículo.
- Editar artículo.
- Movimiento de inventario.
- Crear categoría.
- Crear equipo.
- Cambiar estado de equipo.
- Crear plan de mantenimiento.
- Adjuntar certificado.
- Crear práctica.
- Cambiar estado de práctica.
- Crear reserva.
- Confirmar reserva.
- Publicar aviso.
- Generar QR.
- Generar código temporal QR.
- Cambiar permisos o roles.

El evento debe incluir:

```ts
{
  action: "INVENTORY_ITEM_CREATED",
  entityType: "inventory_item",
  entityId: id,
  previousValue,
  newValue,
  reason,
  metadata,
  request,
}
```

## 9. Base de datos

### Reglas SQL

- Siempre filtrar por `laboratory_id`.
- No hacer queries globales sin tenant.
- No interpolar strings manualmente.
- Usar tagged template de Neon.
- Usar transacciones cuando se creen varias entidades dependientes.
- No borrar registros críticos: usar `status = 'INACTIVE'` o `ARCHIVED`.

### Stock

Prohibido actualizar stock directamente desde UI después de la creación inicial.

El patrón correcto es:

```text
inventory_movements -> trigger -> inventory_items.quantity
```

### QR

Nunca guardar el código temporal en texto plano. Guardar hash.

## 10. Componentes React

### Componentes tontos

La UI debe mostrar datos y disparar acciones. La lógica pesada debe estar en hooks o servicios.

Bueno:

```ts
const { categories, createCategory, loading } = useInventoryCategories();
```

Malo:

```tsx
function InventoryCenter() {
  // 600 líneas de fetch, parsing, validaciones, tablas y formularios
}
```

### Hooks recomendados

```text
hooks/use-inventory-categories.ts
hooks/use-inventory-items.ts
hooks/use-inventory-movements.ts
hooks/use-equipment.ts
hooks/use-education-practices.ts
hooks/use-resource-reservations.ts
hooks/use-qr-labels.ts
hooks/use-educational-dashboard.ts
```

## 11. Formularios

Cada formulario debe tener:

- Validación cliente básica.
- Validación servidor con Zod.
- Estados de loading.
- Mensaje de error legible.
- Botón disabled durante submit.
- Toast de éxito.
- No perder datos si falla la API.

## 12. Seguridad QR

Reglas obligatorias:

1. QR solo contiene URL con token opaco.
2. No incluir stock, lote, ubicación exacta ni datos sensibles en la imagen QR.
3. Código temporal de 6 dígitos.
4. TTL configurable, por defecto 10 minutos.
5. Máximo 5 intentos.
6. Consumo único.
7. Registrar eventos `GRANTED`, `DENIED_BAD_CODE`, `EXPIRED`, `REUSED` si aplica.
8. Mostrar ficha limitada según contexto.

## 13. Modo demo

El modo demo debe mantenerse.

Si `hasDatabase()` es false:

- Retornar datos demo realistas.
- No lanzar errores innecesarios.
- Simular IDs con `crypto.randomUUID()`.
- Simular QR con store global como ya existe.
- Mostrar `mode: "demo"`.

## 14. Manejo de errores

Nunca exponer stack trace al cliente.

Malo:

```ts
return NextResponse.json({ error: error.stack }, { status: 500 });
```

Bueno:

```ts
console.error(error);
return NextResponse.json({
  success: false,
  error: "INTERNAL_ERROR",
  message: "No fue posible completar la operación. Intenta nuevamente."
}, { status: 500 });
```

## 15. Naming

### Acciones de auditoría

Usar formato:

```text
RESOURCE_ACTION_PAST
```

Ejemplos:

```text
INVENTORY_CATEGORY_CREATED
INVENTORY_ITEM_CREATED
INVENTORY_MOVEMENT_RECORDED
EQUIPMENT_CREATED
EQUIPMENT_STATUS_CHANGED
EDUCATIONAL_PRACTICE_CREATED
RESOURCE_RESERVATION_APPROVED
QR_ONE_TIME_CODE_ISSUED
```

### Archivos

- Componentes: `kebab-case.tsx` o mantener estilo actual.
- Hooks: `use-*.ts`.
- Servicios: `*-service.ts`.
- Schemas: `*-schema.ts`.
- Migraciones: `0007_educational_small_lab.sql`.

## 16. Commits

Usar Semantic Commits:

```text
feat: add educational inventory categories
feat: add educational practice reservations
fix: restrict student access to inventory details
refactor: split education center hooks
chore: seed educational demo data
```

## 17. Checklist antes de entregar

- [ ] `npm run typecheck` pasa.
- [ ] `npm run build` pasa.
- [ ] No hay `any` nuevo.
- [ ] Todos los endpoints nuevos validan con Zod.
- [ ] Todos los endpoints nuevos validan sesión y permisos.
- [ ] Las queries filtran por `laboratory_id`.
- [ ] Acciones críticas escriben auditoría.
- [ ] UI de estudiante no muestra información sensible.
- [ ] QR requiere código temporal.
- [ ] El código temporal no puede reutilizarse.
- [ ] Modo demo sigue funcionando.
- [ ] La navegación oculta módulos fuera del MVP educativo.
