# Arquitectura P&R_ventas

## Resumen
- SPA con `React + TypeScript + Vite`.
- UI basada en `Tailwind CSS v4` + `shadcn/ui`.
- Datos orquestados con `React Query`.
- Estado transitorio de sesión, UI y POS con `Zustand`.
- Formularios validados con `React Hook Form + Zod`.
- Tablas operativas con `TanStack Table`.
- Dashboard inicial con `Recharts`.
- Integración Supabase como única fuente de datos.

## Estructura
- `src/app`: providers, layout protegido, router y navegación.
- `src/components`: componentes reutilizables y wrappers UI.
- `src/features`: módulos por dominio (`auth`, `cash`, `sales`, `products`, `users`, `audit`, `dashboard`).
- `src/lib`: utilidades de negocio, formateadores, Supabase y mock database.
- `src/stores`: estado global con persistencia.
- `src/types`: contratos de dominio y shape de Supabase.
- `supabase`: esquema SQL y seeds.

## Patrón de datos
- La app consume Supabase directamente para auth, lectura y escritura de datos.
- Los servicios quedaron alineados con el esquema relacional real: productos, variantes, modificadores, ventas, caja, usuarios y auditoría.

## Fase 1 implementada
- Login y roles `administrador` / `cajero`.
- Layout principal responsive.
- Dashboard inicial.
- Caja: apertura, movimientos y cierre.
- POS: catálogo, carrito, venta y anulación.
- Productos: CRUD base.
- Usuarios: gestión de perfiles base.
- Auditoría: historial de acciones sensibles.

## Fase 2 preparada
- Rutas públicas separadas del backoffice.
- Base visual inicial de `storefront` en `/`.
- Definición de canal web conectado al mismo núcleo operativo.
- Migración prevista para:
  - `orders.source`
  - ETA de preparación y despacho
  - configuración de tienda
  - zonas de reparto
- Catálogo público planificado con lectura abierta y escritura protegida por backend seguro.

## Decisiones técnicas
- El frontend trabaja con payloads tipados ricos para acelerar caja y evitar acoplar la UI a la forma cruda del SQL.
- El esquema de Supabase deja listas tablas de fases 2 y 3 para no rehacer la base relacional.
- Para producción, la creación de usuarios debe pasar por Edge Functions o backend seguro; el frontend sólo administra perfiles y roles.
