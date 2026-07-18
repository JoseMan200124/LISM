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

## Notas de implementación (referencia técnica)

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

- Flujo de aprobación previa (workflow) del responsable que autoriza antes del consumo.
- Cupos o límites máximos de consumo por período y alertas asociadas.
- Reporte regulatorio con formato oficial específico por país.
