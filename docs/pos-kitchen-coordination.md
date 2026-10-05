# Coordinación cocina y caja

El POS consulta las ventas del turno cada 5 segundos. El botón «Activar sonido: listo para empacar» habilita y prueba el audio de este navegador. Un pedido que pasa a `listo` produce un sonido y un aviso con su número. Los pedidos ya listos al abrir la pantalla no generan alarmas retrospectivas. El KDS conserva seis pitidos alternados de onda cuadrada para pedidos nuevos. Caja usa un sonido distinto: tres notas ascendentes de campana, repetidas dos veces, con onda sinusoidal y caída gradual. Ambos botones de prueba reproducen el patrón propio de su pantalla.

En ventas recientes, junto al canal se muestran los datos disponibles del cliente, dirección y observaciones. «Agregar datos» / «Editar datos» abre un formulario dedicado, sin modificar productos, estado ni importes. Todos sus campos son opcionales. El selector de pago permite cambiar efectivo, tarjeta y transferencia; pago mixto abre el editor para distribuir los importes. Las ventas anuladas no admiten edición.

## Base de datos

Antes de publicar esta versión, aplicar `supabase/migrations/20261005120000_optional_dispatch_customer.sql`. Permite que una dirección exista sin cliente asociado; el pedido conserva la relación mediante `delivery_address_id`. Se mantienen las claves foráneas y las políticas de acceso de personal. No se inventan clientes para guardar direcciones incompletas. Los datos de identidad parciales usan las columnas snapshot existentes del pedido. Las direcciones existentes no se modifican, para preservar los pedidos históricos.

El cambio a un pago no efectivo de pedidos web/WhatsApp todavía sin entregar no descuenta dinero que aún no ingresó a caja. Se conserva el flujo existente de cobro al entregar.

## Verificación

- `npm run test:pos-kitchen`: estados listo, ausencia de alertas repetidas, compatibilidad KDS, datos parciales, edición sin cambios de productos/pagos y ajuste de pago aún no cobrado. Usa dobles de Supabase y audio, sin ventas reales.
- `npm run build`: TypeScript y compilación de producción.
- Prueba en el local: habilitar audio en ambas pantallas, crear un pedido de prueba, marcar listo en KDS y comprobar su aviso en caja. Ajustar volumen en cada dispositivo.

Las restricciones de audio y la suspensión de pestañas dependen del navegador: mantener la pantalla de operación abierta y el equipo activo. La aplicación no puede elevar el volumen físico del dispositivo.

La revisión de lint de los archivos nuevos y de servicios pasa. El editor completo de pedidos conserva un error previo de `react-hooks/set-state-in-effect` (inicialización del borrador); el checkout conserva una advertencia previa de React Hook Form. No impiden la compilación.

## Tipo de consumo y tarifa desde ventas recientes

Los selectores permiten cambiar entre consumo local, retiro y despacho, y elegir $2.000, $2.500, $3.000 o $4.000. Las tarifas personalizadas existentes de al menos $2.000 también se conservan como opción. El mínimo del POS es $2.000; consumo local y retiro no cobran despacho. Los pedidos históricos con tarifa inferior no se recargan automáticamente: se identifican para asignar la tarifa correcta.

Aplicar también `supabase/migrations/20261005150000_update_order_fulfillment.sql` antes de publicar. La operación SQL guarda en una transacción el tipo, tarifa, subtotal, total, pago, despacho, movimiento de efectivo y auditoría. Conserva los productos y datos del cliente. Comprueba permiso de cajero/administrador, turno abierto y versión del pedido. La tarifa se reemplaza por diferencia, no se acumula. Tarjeta y transferencia actualizan el detalle leído por el cierre; el efectivo cobrado ajusta además el monto esperado de caja. Web/WhatsApp pendientes de cobro no generan efectivo recibido.

Si cambia el total de un pago mixto, el selector abre el editor con la nueva modalidad y tarifa para distribuir el total entre los medios de pago; no asigna esa diferencia automáticamente.

`npm run test:order-fulfillment` ejecuta la migración en PostgreSQL local en memoria (PGlite) con tablas de prueba basadas en el esquema del repositorio. Verifica mínimo, cambios de tarifa, eliminación del cargo, pagos y caja, pedidos web sin cobrar, protección de pago mixto, permisos, versión desactualizada, idempotencia y reversión completa ante error de auditoría. No conecta a producción ni reemplaza la prueba de despliegue con las políticas y triggers reales.
