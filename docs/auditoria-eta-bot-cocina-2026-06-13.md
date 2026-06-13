# Auditoria del flujo ETA, bot y cocina

Fecha: 2026-06-13

## Resumen ejecutivo

El sistema tiene una conexion funcional de punta a punta:

```text
Storefront o WhatsApp
  -> create_storefront_order()
  -> orders + kitchen_tickets (+ dispatch_orders)
  -> cocina
  -> orders.status = listo
  -> Database Webhook
  -> goupsoluciones.cl/api/webhooks/pedido-listo
  -> WhatsApp al cliente
```

Sin embargo, el ETA no esta integrado de punta a punta. Hoy existen tres
representaciones parcialmente independientes:

1. La tienda muestra un rango base estatico.
2. Supabase calcula una fecha ETA al crear la orden usando cantidad de pedidos.
3. Cocina trabaja con un cronometro transcurrido, sin ver la promesa realizada.

El resultado es que el cliente puede ver o recibir tiempos distintos, mientras
cocina no tiene informacion para priorizar pedidos que estan por vencer.

## Flujo real actual

### 1. Tienda web antes de comprar

`storefront-page.tsx` carga `store_settings` y muestra:

```text
retiro: pickup_base_minutes -> base a base + 10 minutos
despacho: delivery_base_minutes -> base a base + 10 minutos
```

Con la configuracion por defecto:

```text
retiro: 20-30 min
despacho: 35-45 min
```

Este valor:

- no consulta pedidos activos;
- no usa `per_pending_order_minutes`;
- no usa `high_load_threshold`;
- no usa la zona seleccionada;
- no se actualiza por Realtime ni polling;
- no representa la fecha ETA que luego calcula el backend.

### 2. Creacion de orden

Web y WhatsApp llaman el mismo RPC:

```text
public.create_storefront_order(payload jsonb)
```

La funcion:

1. Valida cliente, productos, variantes, modificadores y zona.
2. Cuenta ordenes con `orders.status` en `pendiente` o `en_preparacion`,
   creadas durante las ultimas 12 horas.
3. Calcula:

```text
retiro = pickup_base_minutes + pedidos_activos * per_pending_order_minutes
despacho = delivery_zone.base_minutes + pedidos_activos * per_pending_order_minutes
```

4. Guarda el resultado en `orders.estimated_ready_at`.
5. Para despacho, copia la misma fecha a
   `dispatch_orders.estimated_delivery_at`.
6. Crea `kitchen_tickets.status = pendiente`.
7. Devuelve `estimatedReadyAt`.

### 3. Tienda web despues de comprar

La respuesta del RPC contiene `estimatedReadyAt`, pero el storefront la
descarta. Solo muestra:

```text
Pedido PR-XXXX registrado correctamente.
```

No existe pantalla de confirmacion con hora prometida ni seguimiento visible.

### 4. Bot de Goup Soluciones

Proyecto conectado:

```text
/Users/ptoledos/Documents/Poke and roll
```

El webhook oficial de WhatsApp usa actualmente:

```text
lib/whatsapp/agente-unico-atencion.ts
```

El bot crea la orden con `source = whatsapp` usando el mismo RPC. Recibe:

```text
orderId
number
total
estimatedReadyAt
customerId
```

Pero guarda en la sesion solo:

```text
externalOrderId
externalOrderNumber
```

Por lo tanto, `estimatedReadyAt` se pierde. Existe codigo en
`m11-dar-gracias.ts` para anunciar minutos y hora estimada, pero el orquestador
activo no persiste ese dato y responde:

```text
En breve lo estaremos preparando.
```

### 5. Consulta de estado desde WhatsApp

El bot consulta:

```text
public.get_storefront_order_status(order_id)
```

La RPC devuelve `orders.status` y `estimated_ready_at`. El orquestador activo
traduce el estado, pero no incluye el ETA en su respuesta.

Ademas, `orders.status` sigue en `pendiente` cuando cocina inicia preparacion,
porque esa accion cambia solamente `kitchen_tickets.status`. Por ello el bot no
puede distinguir:

```text
en cola
vs.
en preparacion real
```

### 6. Cocina

Cocina recibe tickets por Supabase Realtime, con polling de respaldo cada 30
segundos.

Estados:

```text
pendiente -> en_preparacion -> listo
```

La pantalla muestra minutos transcurridos desde la creacion de la orden y usa
umbrales fijos:

```text
menos de 10 min: verde
10 a 19 min: amarillo
20 o mas: rojo
```

No muestra:

- `estimated_ready_at`;
- minutos restantes;
- atraso contra la promesa;
- prioridad por vencimiento;
- tiempo desde que comenzo la preparacion;
- complejidad o cantidad total del pedido.

### 7. Pedido listo

Al marcar listo, la UI de cocina realiza dos updates separados:

```text
kitchen_tickets.status = listo
orders.status = listo
```

El segundo cambio dispara un Database Webhook de Supabase hacia:

```text
https://goupsoluciones.cl/api/webhooks/pedido-listo
```

El endpoint valida secret, filtra solo pedidos WhatsApp, evita duplicados y
envia:

```text
retiro: pedido listo para retirar
despacho: pedido listo; coordinando despacho
```

Este ultimo mensaje es correcto: cocina lista no significa delivery en camino.

## Hallazgos priorizados

### Criticos

1. **La tienda promete un ETA distinto al calculado al crear la orden.**
   El cliente ve un rango estatico, mientras el backend suma carga real.

2. **`estimatedReadyAt` se pierde en ambos canales cliente.**
   El storefront lo descarta y el bot no lo persiste en la sesion activa.

3. **Despacho mezcla preparacion con llegada.**
   `orders.estimated_ready_at` se copia directamente a
   `dispatch_orders.estimated_delivery_at`, aunque no existe tiempo separado de
   preparacion, asignacion, retiro por repartidor y trayecto.

4. **Cocina no ve la promesa comunicada al cliente.**
   No puede priorizar por vencimiento ni detectar pedidos atrasados.

### Altos

5. **La carga se mide por numero de ordenes, no por trabajo.**
   Un pedido de una bebida pesa igual que uno de 80 piezas.

6. **La ventana de 12 horas puede inflar el ETA.**
   Ordenes antiguas que quedaron pendientes siguen sumando tres minutos cada
   una.

7. **Inicio de cocina no actualiza `orders.status`.**
   El bot y POS no distinguen cola de preparacion efectiva.

8. **Marcar listo no es atomico.**
   Si se actualiza el ticket y falla la orden, cocina lo pierde de la pantalla
   activa pero el webhook no se dispara.

9. **El POS puede saltar directamente de pendiente a listo.**
   Esto evita que el historial represente el inicio real de preparacion.

### Medios

10. **`high_load_threshold` esta configurado pero no se usa.**
11. **`is_store_open` se muestra, pero el RPC no bloquea pedidos cerrados.**
12. **El ETA de despacho de la portada no usa `delivery_zones.base_minutes`.**
13. **No se recalcula ETA si cambia la cola o cocina se atrasa.**
14. **No se registran tiempos reales de inicio/listo/entrega para calibrar.**
15. **La RPC de consulta acepta solo `order_id`; para anon es un identificador
    sensible sin validacion adicional de telefono.**

## Diferencias de modelo y documentacion

El documento de diseño original propone:

```text
delivery_base_minutes + delivery_zone.base_minutes + carga
```

La implementacion actual usa:

```text
delivery_zone.base_minutes + carga
```

Tambien se llama `estimated_delivery_at` a una copia del ETA de cocina. Se debe
definir explicitamente si `delivery_zones.base_minutes` representa:

1. tiempo total hasta el domicilio; o
2. tiempo de trayecto adicional despues de cocina.

Actualmente el nombre, UI y calculo no expresan una semantica unica.

## Arquitectura recomendada

### Fuente unica

Crear una funcion de dominio unica, por ejemplo:

```text
get_storefront_eta(order_type, zone_id)
```

Debe ser usada por:

- portada web;
- checkout;
- `create_storefront_order`;
- bot;
- POS;
- cocina.

La estimacion debe devolver:

```text
estimated_prep_minutes
estimated_ready_at
estimated_delivery_minutes
estimated_delivery_at
load_level
calculation_version
```

### Separar tiempos

```text
ready_at = cocina terminada
delivery_at = llegada estimada al cliente
```

Para despacho:

```text
delivery_at =
  ready_at
  + buffer_asignacion
  + tiempo_retiro_repartidor
  + tiempo_zona_o_ruta
```

### Integracion con cocina

Agregar al ticket o a una tabla de eventos:

```text
started_at
ready_at
promised_ready_at
completed_at
```

Cocina debe ordenar por `promised_ready_at` y mostrar:

```text
faltan 8 min
vence ahora
atrasado 6 min
```

Las transiciones deben ejecutarse en RPCs atomicas:

```text
start_kitchen_ticket(ticket_id)
complete_kitchen_ticket(ticket_id)
```

### Mejorar estimacion de carga

La carga debe usar unidades de trabajo, no solo cantidad de ordenes:

```text
carga =
  cantidad_items
  + cantidad_piezas_o_porciones
  + peso_por_categoria
  + modificadores
  + tickets_en_preparacion
```

La primera version puede usar una regla simple:

```text
work_units = sum(quantity * product.prep_weight)
```

Luego se calibra con tiempos historicos reales.

## Plan recomendado

### Fase 1: corregir promesa visible

1. Exponer una RPC publica de preview ETA.
2. Mostrar el mismo ETA en portada y checkout.
3. Mostrar `estimatedReadyAt` despues de crear la orden.
4. Persistirlo en la sesion del bot y anunciarlo con redaccion distinta para
   retiro y despacho.
5. Incluir ETA y estado real de cocina en consultas de WhatsApp.

### Fase 2: conectar promesa con cocina

1. Mostrar fecha prometida y atraso en KDS.
2. Sincronizar inicio de cocina con estado operativo consultable.
3. Hacer atomicas las acciones iniciar/listo.
4. Registrar timestamps de cada transicion.

### Fase 3: separar despacho y calibrar

1. Separar `estimated_ready_at` de `estimated_delivery_at`.
2. Incorporar estado y tiempos de repartidor.
3. Medir error real por tipo de pedido, hora y carga.
4. Ajustar automaticamente parametros con datos historicos.

## Criterios de aceptacion

- Web, bot, POS y cocina muestran la misma promesa para una orden.
- El cliente recibe la hora estimada al confirmar.
- Cocina ve cuanto falta para cumplir esa promesa.
- El bot distingue pendiente, preparando, listo y despacho en curso.
- Un delivery listo en cocina nunca se informa como entregado o en camino.
- Los cambios de estado criticos son atomicos.
- Se puede medir diferencia entre ETA prometido y tiempo real.
