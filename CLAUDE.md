# Pizza & Roll — CLAUDE.md

Guía de contexto para Claude Code. Léela antes de trabajar en este repo.

## Qué es este proyecto

Sistema de gestión operativa para un restaurante/pizzería. Incluye POS de ventas, control de caja, pantalla de cocina (KDS), tienda web pública (storefront) e integración con WhatsApp (bot externo "Poke & Roll").

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | React 19 + TypeScript (strict) |
| Build | Vite 8 |
| Routing | React Router 7 |
| Estilos | Tailwind CSS 4 + shadcn/ui (base-nova) |
| Iconos | Lucide React |
| Formularios | React Hook Form + Zod 4 |
| Estado global | Zustand 5 (con persistencia localStorage) |
| Data fetching | TanStack Query 5 |
| Tablas | TanStack Table 8 |
| Gráficos | Recharts 3 |
| Notificaciones | Sonner |
| Backend | Supabase (PostgreSQL + Auth + Realtime + RLS) |

## Comandos esenciales

```bash
npm run dev       # Dev server en localhost:5173
npm run build     # tsc + vite build
npm run lint      # ESLint
npm run preview   # Preview del build
```

## Variables de entorno

Crear `.env.local` (nunca commitear):

```env
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
# Token para kitchen display (mínimo 16 chars). Generar con: openssl rand -hex 32
# Ya no se usa — la cocina ahora requiere login con rol 'cocina'
# VITE_KITCHEN_TOKEN=
```

## Arquitectura

### Estructura de directorios

```
src/
├── app/
│   ├── layouts/        # AppShell (POS/admin), StorefrontShell (tienda)
│   ├── navigation.ts   # Items del menú por rol
│   └── router.tsx      # Rutas + guards (RequireStaff, RequireAdmin, RequireCocina)
├── components/
│   ├── ui/             # shadcn/ui base (Button, Dialog, Input, etc.)
│   ├── common/         # AppLogo, MetricCard, LoadingState, StatusBadge, PageHeader
│   ├── data-table/     # Tablas con TanStack Table
│   └── forms/          # Componentes de formulario compartidos
├── features/           # Módulos de negocio (ver sección Módulos)
├── hooks/              # Hooks globales
├── lib/
│   ├── supabase/       # client.ts, audit.ts, errors.ts
│   ├── auth.ts         # isStaffRole(), isAdmin(), isKitchenRole(), canAccessModule()
│   ├── format.ts       # formatCurrency(), roleLabel(), orderTypeLabel(), etc.
│   ├── business.ts     # Cálculos de negocio
│   └── cash-payments.ts # Lógica de pagos de caja
├── stores/
│   ├── auth-store.ts         # Usuario actual (Zustand + persistencia)
│   ├── pos-store.ts          # Carrito POS + filtros
│   ├── storefront-cart-store.ts # Carrito tienda web
│   └── ui-store.ts           # Estado de UI global
└── types/
    ├── domain.ts       # Todos los tipos de negocio (Role, Order, Product, etc.)
    └── database.ts     # Tipos generados desde Supabase
```

### Convención de features

Cada feature en `src/features/<nombre>/` sigue esta estructura:

```
<feature>/
├── pages/       # Componente de página principal
├── components/  # Componentes específicos del feature
├── hooks/       # useQuery / useMutation con TanStack Query
└── services/    # Llamadas a Supabase (sin lógica de UI)
```

## Módulos

| Feature | Ruta | Roles |
|---------|------|-------|
| `auth` | `/login` | todos |
| `storefront` | `/` | anon, cliente |
| `dashboard` | `/app` | cajero, administrador |
| `sales` | `/app/ventas` | cajero, administrador |
| `cash` | `/app/caja` | cajero, administrador |
| `products` | `/app/productos` | administrador |
| `users` | `/app/usuarios` | administrador |
| `audit` | `/app/auditoria` | administrador |
| `kitchen` | `/cocina` | **cocina**, cajero, administrador |

## Roles y acceso

```typescript
type Role = "administrador" | "cajero" | "cocina" | "cliente";
```

| Rol | Después del login | Acceso |
|-----|------------------|--------|
| `administrador` | `/app` | Todo |
| `cajero` | `/app` | Dashboard, Ventas, Caja + botón Cocina |
| `cocina` | `/cocina` | Solo kitchen display |
| `cliente` | `/` | Solo storefront público |

Guards en el router: `RequireStaff`, `RequireAdmin`, `RequireCocina`.

## Base de datos

### Migraciones SQL (ejecutar en Supabase SQL Editor en orden)

1. `schema.sql` — esquema base completo
2. `seeds.sql` — datos iniciales
3. `add_cocina_role_enum.sql` — **ejecutar solo, en transacción propia**
4. `security_fixes.sql` — fixes de seguridad + rol cocina (ejecutar después del paso 3)
5. Resto de `add_*.sql` según necesidad

### Tablas principales

- `profiles` — usuarios (id = auth.uid(), role, is_active)
- `products` + `product_categories` + `product_variants` + `product_modifier_groups` + `product_modifiers`
- `orders` + `order_items` + `order_item_modifiers` + `order_payments`
- `customers` + `customer_addresses`
- `cash_sessions` + `cash_movements`
- `kitchen_tickets` — pantalla de cocina
- `dispatch_orders` + `delivery_zones`
- `store_settings` — configuración del local

### Funciones SQL clave

- `public.is_admin()` — devuelve true si el usuario es administrador activo
- `public.current_app_role()` — devuelve el rol del usuario actual (verifica is_active)
- `public.create_storefront_order(payload jsonb)` — crea órdenes desde el storefront/WhatsApp; precios se validan siempre desde la BD
- `public.get_storefront_customer_profile(phone)` — perfil + historial del cliente
- `public.cancel_storefront_order(order_id, phone, reason)` — cancela órdenes WhatsApp
- `public.get_storefront_order_status(order_id)` — estado de una orden (anon)
- `public.buscar_productos_activos()` — catálogo público para el storefront

### RLS

Todas las tablas tienen RLS habilitado. Las funciones del storefront usan `SECURITY DEFINER` para operar con permisos elevados sin exponer las tablas directamente a `anon`.

## Flujos de negocio clave

### Venta POS
Cajero abre caja → selecciona productos → elige tipo (consumo/retiro/despacho) → paga → orden creada → ticket de cocina generado automáticamente.

### WhatsApp
Bot externo crea orden con `source='whatsapp'` vía `create_storefront_order()`. Cuando cocina marca como listo (`marcarListo()`), se actualiza `orders.status = 'listo'`, lo que dispara un Database Webhook de Supabase → bot Poke & Roll → notificación WhatsApp al cliente.

### Storefront web
Cliente anónimo navega → agrega al carrito → checkout con nombre y teléfono → paga → orden con `source='web'`.

### Cocina
Personal con rol `cocina` hace login → va directo a `/cocina` → ve tickets en tiempo real (Supabase Realtime) → marca "Iniciar" (en_preparacion) → "Listo" (dispara webhook WhatsApp).

## Convenciones de código

- **Sin comentarios** salvo que el WHY sea no obvio
- **Sin abstracciones prematuras** — tres líneas similares están bien
- **Sin manejo de errores** para escenarios imposibles — confiar en RLS y tipos
- Imports con alias `@/` para todo lo de `src/`
- Tipos en `src/types/domain.ts` (dominio) y `src/types/database.ts` (Supabase auto-generado)
- Servicios devuelven tipos del dominio, no tipos raw de Supabase
- Los hooks de mutación usan `useMutation` de TanStack Query

## Seguridad — reglas críticas

- **Nunca confiar en precios del cliente**: `create_storefront_order()` siempre busca precios en la BD
- **Diferencias de caja > $50.000 CLP** solo las puede confirmar `administrador`
- **Usuarios desactivados** (`is_active = false`) no tienen acceso aunque tengan token activo — `is_admin()` y `current_app_role()` verifican `is_active`
- **Nunca commitear `.env.local`** — ya está en `.gitignore` vía `*.local`
- La `anon key` de Supabase es pública por diseño; la seguridad real está en las políticas RLS y las funciones `SECURITY DEFINER`
