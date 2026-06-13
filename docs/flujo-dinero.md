# Flujo del dinero — De la venta al cierre de caja

> Seguimiento de inicio a fin del dinero en POKE & ROLL: cómo nace en la venta,
> cómo entra a la caja, cómo se cuadra y cierra, qué queda registrado y cómo se
> consulta el historial. Incluye una **revisión del administrador** con hallazgos.
>
> Fuente: `src/features/sales/`, `src/features/cash/`, `src/features/dashboard/`,
> `src/features/audit/`, `src/lib/business.ts`, `src/lib/cash-payments.ts`.
> Verificado en runtime el 2026-06-13 sobre la caja real abierta de Pablo Toledo
> (sin cerrarla). Cifras de ejemplo tomadas de esa sesión.

---

## 0. Mapa de tablas del dinero

| Tabla | Qué guarda |
|-------|------------|
| `orders` | Venta: `total`, `payment_method`, `status`, `source`, `type` |
| `order_payments` | Desglose real del cobro por método (`efectivo`/`tarjeta`/`transferencia`) |
| `cash_sessions` | Turno de caja: apertura, esperado/contado/diferencia **por método**, cierre |
| `cash_movements` | Cada movimiento del turno: apertura, ingreso, retiro, cierre, diferencia |
| `audit_logs` | Trazabilidad: quién hizo qué (apertura, cierre, ventas, anulaciones) |

---

## 1. Dónde nace el dinero — la venta

Una venta puede entrar por tres canales (`orders.source`): `pos`, `web`, `whatsapp`.
En todos los casos se crea la `orders` y su desglose en `order_payments`.

- **POS (`pos`)** — el cajero cobra en `/app/ventas`. El cobro puede ser
  efectivo, tarjeta, transferencia o **mixto** (con desglose `paymentBreakdown`).
- **Web / WhatsApp** — vía `create_storefront_order()`. Inserta `orders` +
  `order_payments`, pero **NO toca `cash_movements`** (ver §3, hallazgo clave).

`order_payments` es la fuente de verdad del cobro: una venta mixta de $10.000
puede tener 2 filas (ej. $6.000 efectivo + $4.000 tarjeta).

---

## 2. Cómo entra el dinero a la caja física (efectivo POS)

Al registrar una venta **en el POS** (`salesService.createOrder`), si hay parte
en **efectivo** ocurre lo siguiente de forma atómica:

1. Se inserta un `cash_movements` tipo **`ingreso`** con:
   - `amount` = parte en efectivo del cobro
   - `reason` = `"Venta PR-XXXXXX"`
   - `linked_order_id` = la orden (así se distingue de un ingreso manual)
2. Se incrementa `cash_sessions.expected_amount` en esa misma cantidad.

> **Solo la parte en efectivo entra al `expected_amount` (caja física).** Tarjeta
> y transferencia no generan movimiento de caja: no hay dinero físico en el cajón.

El "Esperado" que muestra la caja es siempre **efectivo esperado en el cajón**:

```
expected_amount (efectivo) = apertura
                           + Σ ingresos (ventas efectivo POS + ingresos manuales)
                           - Σ retiros
```
`getCashMovementEffect`: apertura/ingreso = `+amount`; retiro/anulación =
`-amount`; cierre/diferencia = `0` (no afectan el esperado).

**Ejemplo real (turno de Pablo):** Monto inicial $44.000 → Esperado $90.980
(= $44.000 apertura + $46.980 de ventas efectivo POS).

---

## 3. Tarjeta y transferencia

No pasan por `cash_movements`. Su monto esperado se **reconstruye en el cierre**
sumando `order_payments` de las órdenes del turno (`fetchSessionSalesSummary`,
filtrando `created_at >= opened_at` y excluyendo `cancelado`).

```
esperado_tarjeta       = Σ order_payments.method='tarjeta'      del turno
esperado_transferencia = Σ order_payments.method='transferencia' del turno
```

> ⚠️ **HALLAZGO CLAVE (revisión admin).** En el cierre, la columna **"Ventas
> app"** de efectivo puede ser **mayor** que **"Esperado app"** de efectivo.
> En el turno de ejemplo: Ventas app efectivo **$117.890** vs Esperado app
> **$90.980** (gap **$26.910**).
>
> **Causa:** las ventas **web/WhatsApp pagadas en efectivo** sí cuentan en
> "Ventas app" (vienen de `order_payments`), pero **no generan `cash_movements`**,
> así que **no suben el `expected_amount`** (caja física). El cuadre toma como
> objetivo el **Esperado app** (el cajón), no el total de ventas en efectivo.
>
> **Implicancia operativa:** si un cliente web/WhatsApp paga efectivo **al
> retirar en el local**, ese billete entra físicamente al cajón pero el sistema
> no lo espera → al contar aparecería como **sobrante**. El admin debe decidir
> la política: (a) cobrar web/whatsapp solo por transferencia/tarjeta, o (b)
> registrar esos retiros como ingreso manual al recibir el efectivo.

---

## 4. Movimientos manuales — ingresos y retiros clasificados

Desde caja, "Registrar movimiento" inserta un `cash_movements` (`ingreso` o
`retiro`) y recalcula `expected_amount` (`updateSessionExpectedAmount`).

Los **retiros** se clasifican por categoría (prefijo en `reason`, ver
`cash-payments.ts`):

| Categoría | Prefijo | Pestaña "Pagos" |
|-----------|---------|-----------------|
| Gasto diario | `[gasto_diario]` | Gastos diarios |
| Adelanto | `[adelanto]` | Adelantos |
| Pago de sueldo | `[pago_sueldo]` | Pagos sueldo |
| Otro pago | `[otro_pago]` | Otros pagos |

La pestaña **Pagos** de caja agrega todos los retiros del turno por categoría
(total, gastos, adelantos, sueldos, otros). Sirve para controlar salidas de
dinero del cajón (sueldos/adelantos/compras).

---

## 5. Cierre de caja y cuadre

Pantalla "Cerrar caja" (`CloseCashPanel`). Antes de cerrar recalcula el esperado
y arma la conciliación por método (`buildCloseSummary`):

| Columna | Significado |
|---------|-------------|
| Operaciones | Nº de ventas con ese método en el turno |
| Ventas app | Σ de cobros de ese método (informativo) |
| Base / ajustes | Solo efectivo: apertura + ingresos manuales − retiros |
| Esperado app | Lo que la app espera (efectivo = cajón; tarjeta/transf = ventas) |
| Revisado / diferencia | Lo que el usuario cuenta y compara (`contado − esperado`) |

- Los campos "Revisado" **se precargan con el Esperado app** → un cuadre perfecto
  es confirmar sin cambios (Diferencia $0).
- El cajero puede **corregir el medio de pago de una orden mal registrada**
  directamente en el detalle desplegable de cada método (`Ver detalle`).
- Al enviar: se inserta `cash_movements` tipo **`cierre`** (= efectivo contado) y,
  si hay diferencia de efectivo, un movimiento **`diferencia`**
  (`"Sobrante en caja"` o `"Faltante en caja"`). La `cash_session` pasa a
  `cerrada` guardando esperado/contado/diferencia **por método** y `closed_at`.

**Ejemplo real (cuadre del turno, sin cerrar):** Ventas turno $156.370 ·
Base caja $44.000 · Monto revisado $129.460 · **Diferencia total $0**.
Efectivo esperado $90.980, Tarjeta $19.490, Transferencia $18.990.

### Reglas de cuadre / diferencias

1. **Si hay cualquier diferencia** (`contado ≠ esperado` en algún método) →
   pide confirmación explícita ("Sí, continuar con diferencias"). Sin confirmar,
   lanza: *"Existen diferencias entre lo revisado y lo registrado…"*.
2. **Diferencia total > $50.000 CLP** → solo la puede confirmar un
   **administrador**. Un `cajero` recibe:
   *"La diferencia total de $X supera el límite permitido para cajero ($50.000).
   Solicita a un administrador que confirme el cierre."*
3. Toda diferencia queda guardada en la sesión y como `cash_movements` tipo
   `diferencia` → auditable.

---

## 6. Qué queda registrado tras cada venta y cierre

| Evento | Registro |
|--------|----------|
| Venta POS | `orders` + `order_payments` + (si efectivo) `cash_movements` ingreso + `audit_logs` (ventas/crear) |
| Venta web/WhatsApp | `orders` + `order_payments` + `kitchen_tickets` (sin `cash_movements`) |
| Anulación | `orders.status='cancelado'` + `audit_logs` (se excluye del cuadre) |
| Apertura | `cash_sessions` (abierta) + `cash_movements` apertura + `audit_logs` |
| Ingreso/Retiro | `cash_movements` + `audit_logs` |
| Cierre | `cash_sessions` (cerrada, montos por método) + `cash_movements` cierre/diferencia + `audit_logs` |

---

## 7. Historial de los días y cómo se consulta

Hay **tres** vistas, todas para `administrador`/`cajero` (auditoría solo admin):

### a) Dashboard `/app` — solo HOY
Métricas del día calculadas en vivo: ventas de hoy, nº de pedidos, ticket
promedio, efectivo esperado (sesión activa), pedidos cancelados, ventas por hora,
mix de pago y top 5 productos. **No tiene rango de fechas.**

### b) Caja `/app/caja` — solo el TURNO actual
Estado, monto inicial, esperado, movimientos del turno (pestaña Movimientos) y
retiros clasificados (pestaña Pagos). **No muestra turnos pasados.**

### c) Auditoría `/app/auditoria` — HISTORIAL multi-día (admin)
La verdadera consulta de historial. Dos pestañas:

- **Movimientos** — trazabilidad de `audit_logs` ordenada por fecha, agrupada y
  filtrable por **mes**. Cada evento: módulo, acción, usuario, fecha, detalle y
  *highlights* (ej. "Venta PR-001045 · Total $4.000"), con valores anterior/nuevo.
- **Ventas** — **resumen operativo diario**. Se elige un día del mes y muestra:
  ventas totales y nº, desglose **efectivo / tarjeta / transferencia**, productos
  vendidos + ranking del día, despachos y delivery cobrado, y retiros por
  categoría (gastos/adelantos/sueldos/otros). Con drill-down al detalle de
  ventas por método.

  **Ejemplo real (13 jun 2026):** 2 ventas · Total $8.000 · Transferencia $8.000
  (2 registros) — corresponden a los pedidos de prueba PR-001057 y PR-001058.

---

## 8. Revisión del administrador — hallazgos

1. ⚠️ **Efectivo web/WhatsApp no entra al `expected_amount`** (ver §3). Define
   política de cobro para evitar sobrantes en el cierre.
2. ⚠️ **No existe vista de cierres/turnos pasados.** Las `cash_sessions` cerradas
   guardan todo (esperado/contado/diferencia por método, `closed_at`), pero **no
   hay UI** para listarlas. El historial de diferencias de caja por día solo es
   visible indirectamente vía `audit_logs` (Auditoría > Movimientos) o
   consultando la tabla en Supabase. *Mejora sugerida: una vista "Historial de
   cajas" que liste sesiones cerradas con su diferencia.*
3. ⚠️ **`cashService.listAllMovements()` está definido pero no se usa** (código
   muerto): no hay pantalla que muestre todos los movimientos de caja entre días.
4. ✅ **Control de diferencias robusto:** confirmación obligatoria + tope de
   $50.000 que exige administrador. Verificado en código.
5. ✅ **Trazabilidad completa:** apertura, ingresos, retiros, cierre, ventas y
   anulaciones quedan en `audit_logs` con autor y timestamp.
6. ✅ **Anulaciones excluidas del cuadre:** las órdenes `cancelado` no suman al
   esperado ni a las ventas del turno.
7. 🔎 **Dashboard y Auditoría recalculan en el cliente** trayendo todas las
   órdenes (`listOrders`/`listDailySalesSummaries` sin límite). Funciona hoy;
   con miles de órdenes/año convendrá paginar o agregar en SQL.
