# Impresora exclusiva de caja

El agente imprime comprobantes de cliente al pasar `orders.status` a `listo` y reportes de caja a petición. Cocina conserva su pantalla y las notificaciones existentes. No se imprime al crear o editar una venta. Se conserva la firma de `enqueue_kitchen_print` por compatibilidad con el checkout atómico, pero la cola retiene esos pedidos hasta que estén listos.

El comprobante contiene productos y variantes, modificadores, observaciones, valores por línea, despacho, adicionales, descuentos, promociones, propina, total y forma de pago. Usa letra compacta incluso si quedó una configuración anterior grande. El nombre y teléfono salen de `store_settings`; la dirección se incluye únicamente si existe `address` o `store_address` en esa configuración. La migración `20261108000200_store_receipt_contact.sql` agrega `store_address` y registra Recoleta 5726, Huechuraba y +569 4099 9386, confirmados por el propietario. La vista previa y la impresión manual reutilizan el contacto de la tienda web como respaldo. No se incluye logo en ESC/POS de texto.

Los cortes X, Z, cuadraturas y el informe diario se imprimen por la misma cola durable. El informe diario mantiene su descarga PDF. El servidor limita la creación de reportes a administrador y cajero. Los textos se normalizan sin secuencias de control antes de enviarse a la impresora.

## Activación coordinada

1. Publicar la aplicación y los nuevos instaladores. La migración agrega una comprobación de compatibilidad `cash-v1` para impedir que los agentes anteriores reclamen los nuevos comprobantes.
2. Aplicar `supabase/migrations/20261108000100_cash_only_printing.sql` y luego `supabase/migrations/20261108000200_store_receipt_contact.sql` en Supabase. La primera migración retira de impresión los trabajos pendientes o en proceso anteriores, conservándolos como fallidos con motivo; no imprime pedidos históricos automáticamente.
3. Publicar la aplicación y actualizar el agente, incluyendo **agent.mjs y cash-document.mjs**. Los instaladores de Windows y macOS incluyen ambos archivos.
4. Reiniciar el servicio y confirmar la impresora de caja y ancho de papel en el panel. El agente actualizado declara soporte `cash-v1` al conectarse y habilita el procesamiento de la cola.
5. Verificar físicamente una venta con despacho: sin impresión al crear/editar, una salida al terminar cocina, importes correctos y legibles. Probar reimpresión, corte X, Z, cuadratura e informe diario.

No se ofrece garantía de exactamente una salida física: si el servicio cae después de enviar al spooler y antes de confirmar el trabajo, el reintento puede duplicarla. La clave del pedido evita duplicados por eventos repetidos normales.

## Verificación local

- `npm run test:cash-print`: ESC/POS compacto, contactos opcionales, valores, ancho, eliminación de controles; migración real en PGlite, retención del checkout, liberación al terminar cocina, deduplicación, autorización y finalización de reportes sin order_id.
- `npm run test:fast-pos` y `npm run test:pos-kitchen`: compatibilidad de ventas y cocina.
- `npm run build`: TypeScript y producción.

La validación local no acredita una migración remota ni una impresión física. El lint general presenta errores en archivos ajenos al cambio; el lint dirigido a los archivos modificados pasa.
