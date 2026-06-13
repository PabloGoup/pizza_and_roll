# Flujo de compra del cliente — Registro completo

> Documento de referencia para alimentar el bot de **goupsoluciones**.
> Describe **todas** las posibilidades que tiene un cliente para comprar,
> configurar y modificar productos en POKE & ROLL, con los límites,
> validaciones y precios reales del sistema.
>
> Fuente: código de `src/features/storefront/`, `src/features/sales/` y la
> función SQL `public.create_storefront_order()`. Verificado en runtime el
> 2026-06-13 (pedido de prueba PR-001058: storefront → POS → cocina → listo).

---

## 1. Canales de origen (`source`)

| Canal | Valor `source` | Quién lo genera |
|-------|----------------|-----------------|
| Tienda web pública | `web` | Cliente anónimo o logueado en el storefront `/` |
| WhatsApp | `whatsapp` | Bot externo vía `create_storefront_order()` con `source='whatsapp'` |
| POS local | `pos` | Cajero en `/app/ventas` |

El bot de goupsoluciones debe crear pedidos con **`source = 'whatsapp'`**
llamando a la función `create_storefront_order(payload jsonb)`. El contrato
de esa función es idéntico para web y WhatsApp (ver §9).

---

## 2. Tipos de pedido (`type` / `order_type`)

| Tipo | Valor | Disponible en storefront/bot | Requisitos |
|------|-------|------------------------------|------------|
| Retiro en local | `retiro_local` | ✅ (modo por defecto) | Solo nombre y teléfono |
| Despacho a domicilio | `despacho` | ✅ | Dirección + comuna con cobertura |
| Consumo en local | `consumo_local` | ❌ Solo POS presencial | — |

> El storefront web y el bot solo ofrecen **Retiro** y **Despacho**.
> `consumo_local` es exclusivo del POS atendido por cajero.

### Retiro en local (`retiro_local`)
- No requiere dirección.
- Tiempo estimado = `pickup_base_minutes` (20 min por defecto) + (pedidos
  pendientes en las últimas 12 h × `per_pending_order_minutes`, 3 min c/u).
- Sin costo de despacho.

### Despacho a domicilio (`despacho`)
- **Obligatorio**: `addressStreet` (calle + número) y `addressDistrict` (comuna).
- La comuna debe coincidir con una zona activa de `delivery_zones` (ver §6).
- Si la comuna no tiene cobertura → error: *"La comuna indicada no tiene
  cobertura de despacho."*
- Campos opcionales: `addressLabel` (etiqueta, ej. "Casa"/"Oficina", default
  "Casa") y `addressReference` (referencia: portón, depto, timbre…).
- Se suma el `fee` de la zona al total y el tiempo usa `base_minutes` de la zona.

---

## 3. Formas de pago (`paymentMethod` / `payment_method`)

| Método | Valor | Storefront/bot | Notas |
|--------|-------|----------------|-------|
| Transferencia | `transferencia` | ✅ (default) | — |
| Efectivo | `efectivo` | ✅ | Pago al recibir/retirar |
| Tarjeta | `tarjeta` | ✅ | — |
| Mixto | `mixto` | ⚠️ Soportado por la función, no expuesto en la web | Requiere desglose `paymentBreakdown` |

### Pago mixto (`mixto`)
Si el bot usa pago mixto debe enviar `paymentBreakdown` con el desglose y la
suma **debe cuadrar exactamente con el total final**, o la función lanza:
*"El pago mixto debe cuadrar con el total final."*

```json
"paymentBreakdown": { "cash": 5000, "card": 3000, "transfer": 2000 }
```

---

## 4. Configuración / modificación de un producto

Cada producto se puede personalizar antes de agregarlo al carrito mediante 4
mecanismos. Todos se combinan en el mismo item.

### 4.1 Cantidad (`quantity`)
- Selector numérico. **Mínimo 1, máximo 20** por item en la UI.
- La función SQL recorta a un máximo de **100 unidades por item** como tope duro.

### 4.2 Variantes (`variantId`)
- Si el producto tiene variantes (ej. tamaños/porciones), el cliente elige una.
- Se preselecciona la variante marcada como `isDefault` (o la primera).
- **El precio sale de la variante**, no del producto base.
- El bot envía `variantId` (UUID). Si es inválido/ausente, se usa `base_price`
  del producto.

### 4.3 Modificadores del producto (`modifierIds`)
- Lista de cambios directos definidos por producto (checkboxes).
- Cada modificador tiene un `priceDelta` (puede ser 0 = "Sin costo" o `+$N`).
- El cliente puede marcar varios.
- El bot envía un array `modifiers` con `{ id }` (UUID). **El `priceDelta`
  siempre se revalida desde la BD**; el precio que envíe el cliente se ignora.

### 4.4 Cambios y agregados cobrados (sushi)
Opciones manuales de cambio/agregado con precio fijo. Cada una acepta de 0 a 4
unidades (UI) y se cobra por unidad:

| Opción | Precio unitario | Qué incluye |
|--------|-----------------|-------------|
| Agregar cambio de palta | **+$500** | Agregar palta o queso crema |
| Agregar cambio de proteínas | **+$1.000** | Pollo, kanikama, palmito, pepino o champiñón |
| Agregar cambio premium | **+$1.500** | Salmón o carne |

### 4.5 Observaciones del item (`notes`)
- Texto libre por producto: cambios, salsas, cortes, sin cebollín, salsa aparte, etc.
- Máximo **160 caracteres** en la UI.

---

## 5. Carrito y checkout

### Datos del cliente (obligatorios)
| Campo | Validación |
|-------|------------|
| `customerName` | Requerido, **máx. 100 caracteres** |
| `customerPhone` | Requerido, solo dígitos, **mínimo 8** (la función limpia no-dígitos) |

### Datos opcionales del pedido
| Campo | Validación |
|-------|------------|
| `notes` (nota general del pedido) | Máx. **500 caracteres** |
| `addressStreet` (despacho) | Máx. **200 caracteres** |
| `addressReference` (despacho) | Máx. **200 caracteres** |

### Límites del carrito
- **Máximo 30 tipos de producto** distintos por carrito.
- Carrito vacío → error: *"Agrega al menos un producto al carrito."*

### Cálculo del total
```
subtotal      = Σ (precio_unitario_BD + Σ priceDelta_modificadores_BD) × cantidad
delivery_fee  = fee de la zona (solo despacho), 0 en retiro
total         = subtotal + delivery_fee
```
- Descuentos y promociones del cliente **se ignoran** (`discount_amount = 0`,
  `promotion_amount = 0`). Solo el POS atendido puede aplicar descuentos.

---

## 6. Zonas de despacho (cobertura real actual)

Las comunas con cobertura se leen de `delivery_zones` (solo `is_active = true`).
Valores vigentes al 2026-06-13:

| Zona | Comuna (`district`) | Costo (`fee`) | Tiempo base |
|------|---------------------|---------------|-------------|
| Zona Norte | Huechuraba | $2.000 | 35 min |

> La comparación de comuna es **case-insensitive**. Comunas fuera de esta lista
> no tienen despacho y el pedido se rechaza.

---

## 7. Estimación de tiempo de preparación

```
retiro:    pickup_base_minutes  (20) + pendientes_12h × per_pending (3)
despacho:  zona.base_minutes          + pendientes_12h × per_pending (3)
```
`pending_orders` = pedidos con estado `pendiente` o `en_preparacion` creados en
las últimas 12 horas. El resultado se devuelve como `estimatedReadyAt` (UTC).

---

## 8. Ciclo de vida del pedido (estados)

Estado real en `orders.status` y su etiqueta visible en el POS:

| `orders.status` | Etiqueta POS | Quién lo cambia |
|-----------------|--------------|-----------------|
| `pendiente` | "En preparación" | Estado inicial al crear el pedido |
| `en_preparacion` | "En preparación" | (ticket de cocina; `orders` sigue en `pendiente` hasta "listo") |
| `listo` | "Terminado" | Cocina marca **LISTO ✓** → dispara webhook WhatsApp |
| `entregado` | "Entregado" | POS marca **"Marcar entregado"** |
| `cancelado` | "Cancelado" | POS/cliente anula |

### Transiciones verificadas en runtime (pedido PR-001058)
1. Cliente compra en storefront → `orders.status = 'pendiente'`,
   `kitchen_tickets.status = 'pendiente'`. ✅
2. Aparece en POS `/app/ventas` (filtro "🌐 Web") como "En preparación". ✅
3. Aparece en cocina `/cocina` con botón **"Iniciar preparación"**. ✅
4. Cocina "Iniciar preparación" → `kitchen_tickets.status = 'en_preparacion'`
   (la orden sigue `pendiente`). ✅
5. Cocina **"LISTO ✓"** → `kitchen_tickets.status = 'listo'` **y**
   `orders.status = 'listo'` → POS muestra **"Terminado"** y se dispara el
   Database Webhook → bot Poke & Roll → notificación WhatsApp. ✅
6. POS puede **"Marcar entregado"** (`entregado`) o **"Volver a preparación"**
   (`pendiente`). ✅

> ⚠️ **Nota de comportamiento**: el botón del POS para un pedido `pendiente`
> es "Marcar terminado" y salta **directo a `listo`** (no pasa por
> `en_preparacion`). El paso `en_preparacion` solo lo registra la pantalla de
> cocina sobre el `kitchen_ticket`. Para el cliente/bot, el estado relevante
> que cambia es `pendiente → listo → entregado`.

### Cancelación (canal web/WhatsApp)
La función `public.cancel_storefront_order(order_id, phone, reason)` permite
cancelar un pedido validando el teléfono del cliente.

---

## 9. Contrato del RPC `create_storefront_order(payload jsonb)`

El bot debe invocar este RPC. Estructura completa del `payload`:

```json
{
  "cart": [
    {
      "productId": "uuid-del-producto",
      "variantId": "uuid-de-variante-o-null",
      "quantity": 2,
      "notes": "sin cebollín, salsa aparte",
      "modifiers": [
        { "id": "uuid-modificador", "name": "Agregar cambio de palta" }
      ]
    }
  ],
  "checkout": {
    "type": "retiro_local",            // o "despacho"
    "paymentMethod": "transferencia",  // efectivo | tarjeta | transferencia | mixto
    "paymentBreakdown": { "cash": 0, "card": 0, "transfer": 0 }, // solo si mixto
    "source": "whatsapp",              // el bot usa whatsapp
    "customerName": "Juan Pérez",
    "customerPhone": "+56 9 1234 5678",
    "notes": "Tocar el timbre",
    "addressLabel": "Casa",            // solo despacho
    "addressStreet": "Av. Siempre Viva 742", // solo despacho
    "addressDistrict": "Santiago",     // solo despacho, debe tener cobertura
    "addressReference": "Depto 42, portón negro" // solo despacho
  }
}
```

### Respuesta
```json
{
  "orderId": "uuid",
  "number": "PR-001058",
  "total": 4000,
  "estimatedReadyAt": "2026-06-13T05:23:52Z",
  "customerId": "uuid"
}
```

### Reglas de seguridad que aplica la función (no negociables)
- **Los precios SIEMPRE se toman de la BD.** Cualquier `unitPrice`/`priceDelta`
  enviado por el cliente se ignora.
- Cantidad por item recortada a **[1, 100]**.
- Máx. **30 tipos de producto** por carrito.
- `customerName` ≤ 100, `notes` ≤ 500, dirección/referencia ≤ 200 caracteres.
- `customerPhone` ≥ 8 dígitos.
- Producto inexistente o inactivo (`status != 'activo'`) → *"Producto no
  disponible o inactivo."*
- Despacho sin calle o comuna → *"Para despacho debes completar dirección y comuna."*
- Comuna sin cobertura → *"La comuna indicada no tiene cobertura de despacho."*
- `discount_amount` y `promotion_amount` se fuerzan a 0 (sin descuentos por bot).
- Al crear el pedido se inserta automáticamente el `kitchen_ticket` (cocina) y,
  si es despacho, el `dispatch_order`.

---

## 10. Catálogo de productos (consulta para el bot)

Para listar productos activos con sus variantes/modificadores, usar la función
pública `public.buscar_productos_activos()` (catálogo del storefront). Cada
producto trae: `id`, `name`, `description`, `base_price`, `category`,
`variants[]` (con `id`, `name`, `price`, `isDefault`) y `modifiers[]` (con
`id`, `name`, `priceDelta`).

Categorías actuales del menú (78 productos): Futomaki, California, Sushi,
Avocados, Bebidas, Rolls Calientes, Sushis Premium, Ceviches, Promos Sushi,
Promociones Rolls, Aperitivos, Hand Roll, Sushi Sin Arroz, Sushiburger,
Poke Bowl, Promos Poke, Promos Ceviche.
