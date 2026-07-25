# Historia de usuario — Control de reactivos de doble uso o precursores

## Contexto

Los laboratorios que manejan reactivos de **doble uso** o **precursores** deben
demostrar trazabilidad completa de su consumo ante controles internos y ante
revisiones del ministerio o entidad reguladora. Hoy el inventario registra
movimientos con responsable y motivo, pero no distingue estos reactivos ni
obliga a capturar la información mínima que exige una auditoría regulatoria.

## Historia de usuario

> **Como** jefe de laboratorio (o administrador),
> **quiero** marcar un reactivo como de doble uso o precursor y que el sistema
> exija un registro de consumo con trazabilidad completa cada vez que se
> descuente del inventario,
> **para** cumplir con los controles internos y con cualquier revisión del
> ministerio o entidad reguladora.

## Alcance

1. Al **registrar o editar** un reactivo en Inventario, el sistema incluye una
   opción **obligatoria**: *¿Es reactivo de doble uso o precursor?* (**Sí / No**).
2. Si se elige **No**, el reactivo sigue el flujo normal de inventario.
3. Si se elige **Sí**, el reactivo queda marcado como **controlado** (con su tipo:
   doble uso, precursor o ambos) y habilita un registro especial obligatorio.
4. El registro de consumo guarda, como mínimo:
   - Reactivo utilizado
   - Cantidad consumida
   - Fecha y hora del consumo
   - Usuario/persona que lo utilizó
   - Área, laboratorio o proyecto relacionado
   - Motivo o finalidad de uso
   - Responsable que autoriza o valida el consumo (si aplica)
   - Observaciones
   - Saldo antes y después del consumo
5. Para reactivos controlados, el sistema **impide** descontar existencia
   (consumo, descarte o ajuste negativo) **sin** completar el registro de consumo.
6. Existe una vista aparte, **"Registro de reactivos controlados"**, que lista
   únicamente los reactivos de doble uso o precursor con su historial completo de
   movimientos y consumos, y permite exportarlo.

## Criterios de aceptación

- **CA1 — Campo obligatorio en alta.** Dado el formulario de registro de un
  reactivo, cuando intento guardarlo sin responder *¿Es reactivo de doble uso o
  precursor?*, entonces el sistema no permite guardar hasta elegir Sí o No.
- **CA2 — Campo obligatorio en edición.** Dado un reactivo existente, cuando lo
  edito, entonces la misma pregunta aparece con su valor actual y sigue siendo
  obligatoria; al pasar de No a Sí debo indicar el tipo (doble uso / precursor /
  ambos).
- **CA3 — Flujo normal si No.** Dado un reactivo marcado como No, cuando registro
  un consumo, entonces se comporta como cualquier artículo (sin campos extra).
- **CA4 — Marca de controlado.** Dado un reactivo marcado como Sí, entonces queda
  identificado como *controlado* en su ficha y en el inventario, y siempre exige
  registro de consumo (no puede desactivarse esa exigencia mientras sea controlado).
- **CA5 — Registro obligatorio al descontar.** Dado un reactivo controlado, cuando
  intento consumir, descartar o ajustar a la baja sin capturar *usuario/persona
  que lo utilizó*, *área/laboratorio/proyecto* y *motivo/finalidad*, entonces el
  sistema rechaza la operación con un mensaje claro y **no** descuenta existencia.
- **CA6 — Traza completa persistida.** Dado un consumo válido de un reactivo
  controlado, entonces el movimiento guarda reactivo, cantidad, fecha y hora,
  quién lo usó, área/proyecto, finalidad, responsable que autoriza (si aplica),
  observaciones y el saldo antes y después.
- **CA7 — Saldo antes/después.** Dado cualquier movimiento, entonces el saldo
  antes y después se calcula automáticamente y no puede quedar negativo.
- **CA8 — Vista dedicada.** Dado que soy un usuario con permiso de inventario,
  cuando abro *Registro de reactivos controlados*, entonces veo únicamente los
  reactivos controlados, su existencia, el número de consumos y la fecha del
  último consumo, y puedo abrir cada uno para ver su historial completo.
- **CA9 — Exportación.** Dado el historial de un reactivo controlado, cuando lo
  exporto, entonces obtengo un CSV con qué se usó, cuánto, cuándo, quién, para qué,
  área/proyecto, quién autoriza, saldos y observaciones.
- **CA10 — Auditoría.** Cada alta, edición y movimiento queda en la bitácora de
  auditoría con actor, fecha y valores.

## Regla clave

> Todo consumo de reactivos de doble uso o precursores debe quedar registrado con
> trazabilidad completa: **qué se usó, cuánto se usó, cuándo, quién lo usó y para
> qué se usó.**

## Ampliación — Autorización digital previa (julio 2026)

Antes, aunque el consumo quedaba registrado, el permiso para usar el reactivo se
gestionaba **en papel**: la persona llenaba una hoja, la llevaba físicamente al
responsable, esperaba la firma y regresaba con ella para poder usar el reactivo.
Ese ir y venir ya ocurre dentro del sistema.

### Flujo

1. **Solicitar uso.** En *Reactivos controlados* → **Solicitar uso**, la persona
   llena una sola vez el reactivo, la cantidad, quién lo usará, el área o
   proyecto, la finalidad y (opcional) la fecha prevista. El sistema asigna un
   folio correlativo `AU-<año>-NNN`.
2. **Notificación al responsable.** La solicitud aparece en su bandeja
   *Autorizaciones* y en sus notificaciones, sin que nadie tenga que buscarlo.
3. **Autorizar o rechazar.** El responsable autoriza (pudiendo ajustar la
   cantidad y la vigencia) o rechaza indicando el motivo. Todo queda con su
   nombre y sello de tiempo.
4. **Aviso de vuelta.** El solicitante recibe la notificación de la respuesta.
5. **Consumo en un clic.** Con la autorización vigente, *Registrar consumo* solo
   pide confirmar la cantidad: la trazabilidad ya viene de la autorización y no
   se vuelve a escribir. El movimiento descuenta existencia y **cierra** la
   autorización (`CONSUMED`), que no puede reutilizarse ni vencer dos veces.

### Reglas

- **CA11 — Autorización previa obligatoria.** Si el laboratorio exige
  autorización previa, un usuario sin potestad de autorizar no puede descontar un
  reactivo controlado sin una autorización **aprobada y vigente**; el sistema lo
  rechaza explicando cómo solicitarla y **no** descuenta existencia.
- **CA12 — El responsable no se bloquea.** Quien puede crear y editar inventario
  (`inventory.manage`) puede consumir sin solicitud previa: el movimiento se
  registra como *autorizado en el acto* por él mismo, con su nombre.
- **CA13 — Cantidad acotada.** El consumo no puede exceder la cantidad
  autorizada; si el responsable autorizó menos de lo pedido, manda su cantidad.
- **CA14 — Vigencia.** Una autorización aprobada vence según la política del
  laboratorio (72 horas por defecto, configurable de 1 a 720). Vencida, deja de
  habilitar el consumo.
- **CA15 — Un solo uso.** Cada autorización ampara un consumo. Al consumirse
  queda ligada al movimiento (`inventory_movements.usage_request_id`) y su folio
  aparece en el historial del reactivo.
- **CA16 — Cancelación.** El solicitante (o el responsable) puede cancelar una
  solicitud mientras no se haya consumido.
- **CA17 — Trazabilidad de la autorización.** Solicitud, autorización, rechazo,
  cancelación y consumo escriben en la bitácora
  (`CONTROLLED_USAGE_REQUESTED / APPROVED / REJECTED / CANCELLED / CONSUMED`).
- **CA18 — Exportación.** La bandeja de autorizaciones se exporta a CSV con
  folio, cantidades solicitada y autorizada, quién solicita, quién autoriza,
  fechas, vigencia y consumo.

### Política configurable

Un administrador (`configuration.manage`) decide en *Reactivos controlados →
Autorizaciones*:

- **Exigir autorización previa** antes de consumir (activado por defecto, pues
  reproduce el control que el laboratorio ya ejercía en papel).
- **Vigencia de la autorización** en horas.

Se guarda en `laboratory_settings.controlled_usage_policy`. Con la autorización
previa desactivada, el consumo se comporta como antes: exige el registro de
trazabilidad completa, sin aprobación de nadie.

## Notas de implementación (referencia técnica)

- **Autorización digital** (`database/0020_controlled_usage_authorization.sql`):
  `controlled_usage_requests` (folio, cantidad solicitada y autorizada, vigencia,
  cierre por consumo), `inventory_movements.usage_request_id` y
  `laboratory_settings.controlled_usage_policy`. Reglas puras en
  `lib/controlled-reagents.ts` (estados, vigencia, cantidad autorizada, política),
  acceso a datos en `lib/controlled-usage-service.ts`, APIs en
  `app/api/inventory/controlled/requests/` y `.../controlled/policy/`, y UI en
  `components/controlled-reagents-center.tsx` (pestaña *Autorizaciones*) más el
  selector de autorización del modal de consumo en `components/resources-center.tsx`.
  Las notificaciones de ida y vuelta se resuelven en `lib/notifications.ts`.
- **Base de datos** (`database/0018_controlled_reagents.sql`, aditiva e idempotente):
  `inventory_items.is_controlled`, `inventory_items.control_kind`; y en
  `inventory_movements`: `usage_area`, `usage_purpose`, `used_by_person`,
  `authorized_by`. El saldo antes/después ya lo calcula el trigger
  `apply_inventory_movement` (`previous_quantity` / `resulting_quantity`).
- **Reglas de negocio** (`lib/controlled-reagents.ts`, con pruebas en
  `__tests__/inventory/controlled.test.ts`): qué movimientos descuentan
  existencia y qué campos son obligatorios.
- **APIs**: alta/edición (`app/api/inventory/route.ts`, `app/api/inventory/[id]/route.ts`),
  consumo (`app/api/inventory/movements/route.ts`), descarte
  (`app/api/inventory/[id]/discard/route.ts`) y el registro dedicado
  (`app/api/inventory/controlled/route.ts`).
- **UI**: formularios de alta/edición y modal de consumo en
  `components/resources-center.tsx`; vista dedicada en
  `components/controlled-reagents-center.tsx` (módulo `controlled`).

## Fuera de alcance (posible backlog futuro)

- Cupos o límites máximos de consumo por período y alertas asociadas.
- Reporte regulatorio con formato oficial específico por país.
- Firma electrónica reautenticada (`electronic_signatures`) sobre la autorización,
  además del registro en bitácora.
- Consumos parciales sucesivos sobre una misma autorización (hoy cada
  autorización ampara un consumo).
