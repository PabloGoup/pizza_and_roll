# Etapa 2: Tienda Web Conectada al POS

## Objetivo
Construir un canal público de venta conectado al mismo núcleo operativo del POS. La tienda web no será una app separada a nivel de negocio: usará el mismo catálogo, los mismos pedidos y la misma auditoría.

## Principios
- Un solo backend: `Supabase`
- Un solo catálogo: `products`, `product_variants`, `product_modifier_groups`, `product_modifiers`
- Un solo flujo de pedidos: `orders`, `order_items`, `order_item_modifiers`, `dispatch_orders`
- Un solo historial operativo: caja, auditoría y estados centralizados

## Módulos
1. `storefront`
   - landing
   - catálogo público
   - promos
   - detalle/configuración de producto
2. `cart`
   - carrito persistente
   - subtotal, despacho y total
3. `checkout`
   - cliente
   - retiro o despacho
   - zona y dirección
   - resumen final
4. `tracking`
   - seguimiento por teléfono + número de pedido
5. `order-core`
   - cálculo de total
   - cálculo de despacho
   - ETA
   - validaciones compartidas con POS

## Tablas reutilizadas
- `product_categories`
- `products`
- `product_variants`
- `product_modifier_groups`
- `product_modifiers`
- `customers`
- `customer_addresses`
- `orders`
- `order_payments`
- `order_items`
- `order_item_modifiers`
- `dispatch_orders`
- `kitchen_tickets`

## Nuevos elementos mínimos

### En `orders`
- `source`
  - `pos`
  - `web`
  - `whatsapp`
- `estimated_ready_at`
- `customer_phone_snapshot`
- `customer_name_snapshot`

### En `dispatch_orders`
- `delivery_fee`
- `estimated_delivery_at`
- `zone_id`

### Nueva tabla `store_settings`
Configuración general de la tienda:
- nombre comercial
- teléfono soporte
- estado abierta/cerrada
- tiempo base retiro
- tiempo base despacho
- minutos adicionales por pedido activo
- umbral de alta carga
- moneda

### Nueva tabla `delivery_zones`
Define zonas, comunas y despacho:
- nombre
- comuna/district
- tarifa
- minutos base
- activa/inactiva
- orden visual

## Flujo cliente
1. El cliente entra a la tienda pública.
2. Revisa categorías, favoritos y promociones.
3. Configura producto con variantes, modificadores y cambios cobrados.
4. Agrega productos al carrito.
5. Elige retiro o despacho.
6. El sistema calcula:
   - subtotal
   - cargo de despacho
   - tiempo estimado
7. El cliente confirma el pedido.
8. El pedido entra a `orders`.
9. El POS lo recibe como pedido nuevo.
10. El cliente puede seguir el estado.

## Flujo interno
1. Se crea `orders` con `source = 'web'`.
2. Se crean `order_items` y `order_item_modifiers`.
3. Si corresponde, se crea `dispatch_orders`.
4. Si aplica, se genera `kitchen_tickets`.
5. El POS gestiona estados:
   - `pendiente`
   - `en_preparacion`
   - `listo`
   - `entregado`
   - `cancelado`

## Regla inicial de ETA
Versión recomendada para el MVP:

`ETA = base_tipo + (pedidos_activos * per_pending_order_minutes) + base_zona`

Donde:
- retiro usa `pickup_base_minutes`
- despacho usa `delivery_base_minutes + delivery_zones.base_minutes`
- pedidos activos = pedidos `pendiente` + `en_preparacion`

## Seguridad
- El catálogo sí puede ser público.
- La creación de pedidos web no debe escribirse directo desde el navegador a tablas sensibles.
- La recomendación correcta es usar:
  - Edge Function de Supabase
  - o backend server-side

Eso permite validar:
- horario de tienda
- tarifa de despacho
- ETA real
- payload del pedido
- origen `source = web`

## Orden de implementación
1. Migración mínima de base de datos
2. Reglas de lectura pública del catálogo
3. Servicio seguro para crear pedidos web
4. Catálogo público
5. Carrito
6. Checkout
7. Tracking
8. Ajuste fino de ETA

## MVP recomendado
- catálogo público
- carrito
- checkout
- retiro o despacho
- ETA visible
- pedido inserto en el mismo núcleo
- seguimiento por número + teléfono
- sin pago online obligatorio en la primera salida

## Criterio de éxito
- un pedido web aparece en el POS sin reprocesos
- el catálogo es el mismo que usa caja
- caja/auditoría no se rompen
- despacho y ETA quedan trazables desde la misma base
