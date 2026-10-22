# Reparto

## Activación

1. Aplicar `supabase/migrations/20261022090000_add_repartidor_role.sql` y confirmar su transacción.
2. Aplicar `supabase/migrations/20261022091000_delivery_access.sql`. Requiere el esquema existente y `is_active_staff()` de la migración de caja compartida.
3. Desplegar la Edge Function `admin-create-user` actualizada y el frontend.
4. En Usuarios, crear un perfil con rol **Repartidor**, nombre de acceso y contraseña. No se incluyen contraseñas predeterminadas.
5. Caja → **Reparto** → elegir repartidor en cada pedido. El repartidor inicia sesión con sus credenciales y entra directamente en `/reparto`.

Los pedidos con despacho aparecen en la vista de caja automáticamente; el repartidor solo recibe los asignados a su usuario. Caja puede reasignarlos o quitar la asignación. Las asignaciones son explícitas para evitar enviar un pedido al repartidor incorrecto.

## Operación

La pantalla muestra número de pedido, cliente, total completo, dirección y teléfono con botones de copia. Los datos faltantes se indican para consultar en caja. Consulta estados cada cinco segundos y al recuperar el foco/conexión. Solo el repartidor asignado y activo puede confirmar una entrega de un pedido listo. Una confirmación solicita verificar la entrega y actualiza pedido, despacho, comanda y auditoría en una transacción. Las entregas salen de la cola activa; se conserva su registro en la base de datos.

La entrega conserva la regla existente de cobro en efectivo de web/WhatsApp: registra el ingreso una sola vez en la caja abierta. Si debe registrar efectivo y no hay caja abierta, rechaza la operación completa. Las ventas POS ya cobradas no generan otro ingreso.

El sonido de reparto usa una secuencia nueva de ondas sawtooth (880/1175/1568 Hz), diferente de cocina y caja. Suena al recibir pedidos y cuando pasan a listos, incluso si ya estaban listos al ingresar. No hay interruptor de silencio. Requiere una primera interacción por las restricciones del navegador; el estado y el botón de activación/prueba permanecen visibles. No puede anular el volumen o silencio del teléfono ni garantizar alertas si el sistema suspende la pestaña o la aplicación. Mantener pantalla abierta y volumen alto; verificar físicamente el sonido en el dispositivo del repartidor.

## Seguridad y verificación

Las RPC devuelven solo los datos necesarios y verifican usuario activo, rol, asignación y estado en el servidor. No se concede al repartidor lectura directa de ventas, pagos o clientes. Las políticas restrictivas bloquean acceso directo para cuentas de repartidor, incluso ante políticas permisivas anteriores; solo se permite leer su propio perfil. Las cuentas desactivadas siguen restringidas.

- `npm run test:delivery`: permisos, aislamiento RLS frente a políticas permisivas, protección de perfil, asignación, estado, rollback, idempotencia y cobro de efectivo web.
- `npm run test:pos-kitchen` y `npm run test:order-fulfillment`: regresiones existentes.
- `npm run build`: TypeScript y producción.

La comprobación local de navegador usa datos de prueba en memoria; no demuestra despliegue ni RLS remoto. Para cerrar la activación se requiere probar con cuentas reales distintas (caja y dos repartidores), cambiar preparación → listo desde cocina, reasignar, copiar datos y entregar desde el teléfono. Confirmar que el otro repartidor no ve ni modifica pedidos ajenos y que caja refleja la entrega.
