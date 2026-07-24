# Pizza & Roll — Sistema POS

Sistema de gestión operativa para restaurante/pizzería. Incluye punto de venta, control de caja, pantalla de cocina (KDS), tienda web pública e integración con WhatsApp.

## Stack

- **Frontend:** React 19 + TypeScript + Vite 8
- **Estilos:** Tailwind CSS 4 + shadcn/ui (base-nova)
- **Formularios:** React Hook Form + Zod
- **Estado:** Zustand + TanStack Query + TanStack Table
- **Gráficos:** Recharts
- **Backend:** Supabase (PostgreSQL + Auth + Realtime + RLS)

## Primeros pasos

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Editar `.env.local` con las credenciales de tu proyecto Supabase:

```env
VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<tu-anon-key>
```

### 3. Configurar la base de datos

Ejecutar en el SQL Editor de Supabase **en este orden**:

| # | Archivo | Descripción |
|---|---------|-------------|
| 1 | `supabase/schema.sql` | Esquema completo (tablas, funciones, RLS) |
| 2 | `supabase/seeds.sql` | Datos iniciales y usuario bot |
| 3 | `supabase/add_cocina_role_enum.sql` | **Ejecutar solo, en query separada** |
| 4 | `supabase/security_fixes.sql` | Seguridad y rol cocina (después del paso 3) |
| 5 | `supabase/add_tip_amount.sql` | Columna `tip_amount` en `orders` (propinas en el POS) |
| 6 | `supabase/add_toggle_favorite.sql` | Función para que el cajero marque favoritos desde el POS |
| 7 | `supabase/add_print_agent_queue.sql` | Cola durable y credenciales del agente de impresión |

> Los pasos 3 y 4 deben ejecutarse en queries separadas. PostgreSQL no permite usar un valor de enum nuevo en la misma transacción en que fue creado.

### 4. Iniciar el servidor de desarrollo

```bash
npm run dev       # http://localhost:5173
npm run build     # Build de producción
npm run preview   # Preview del build
npm run lint      # ESLint
```

## Acceso al sistema

| Rol | URL de entrada | Acceso |
|-----|---------------|--------|
| `administrador` | `/app` | Todo: POS, caja, productos, usuarios, auditoría, cocina |
| `cajero` | `/app/ventas` | Dashboard, ventas, caja + botón de cocina |
| `cocina` | `/cocina` | Pantalla de tickets en tiempo real |
| `cliente` / anónimo | `/` | Tienda web pública |

Para crear usuarios con rol `cajero` o `cocina`, usa la pantalla **Usuarios** desde una cuenta de administrador.

## Funcionalidades

### POS / Ventas (`/app/ventas`)
- Búsqueda de productos con variantes y modificadores
- Tipos de orden: consumo en local, retiro y despacho a domicilio
- Métodos de pago: efectivo, tarjeta, transferencia y mixto
- Integración con órdenes de WhatsApp (pago diferido en caja)
- Impresión automática de la comanda al confirmar una venta local
- Formato térmico de 58 mm y reimpresión manual desde ventas recientes

#### Impresión automática mediante agente local

La ruta principal de producción es:

`Web/POS → cola Supabase → agente de cocina → RAW/ESC-POS → impresora`

Solo el computador conectado físicamente a la impresora instala el agente. Los
demás computadores operan desde la misma web sin QZ Tray ni controladores de
esa impresora. La cola persiste trabajos, evita duplicados, registra errores y
reintenta aunque la pestaña se cierre o el equipo se reinicie.

La instalación para macOS y Windows está documentada en
[`print-agent/README.md`](print-agent/README.md). En Windows el instalador crea
una tarea de sistema que arranca con el equipo incluso sin una sesión abierta.

QZ Tray y el puente local de Vite se conservan temporalmente como compatibilidad
durante el despliegue, pero no forman parte de la ruta principal una vez
instalada la cola.

#### Configuración térmica de respaldo del navegador

- Papel: `58 mm`
- Área imprimible seleccionada en macOS: `58(48 mm) × 210 mm`
- Escala: `100 %`
- Márgenes: `Ninguno` o `Mínimos`
- Encabezados y pies de página del navegador: desactivados
- Impresora térmica: configurada como predeterminada en el equipo de caja

La impresión manual usa el diálogo del navegador únicamente cuando falla QZ
Tray. Safari siempre muestra ese diálogo por seguridad.

En el diálogo de macOS se debe desactivar **Imprimir encabezados y pies de
página**. Si el papel físico continúa saliendo completamente en blanco aunque la
vista previa muestre contenido, el problema está entre el controlador y la
impresora (no en el HTML): probar una página de prueba desde Ajustes del Sistema
y revisar que el driver corresponda al modelo térmico instalado.

### Caja (`/app/caja`)
- Apertura con monto inicial
- Ingresos y retiros manuales
- Cierre con conteo físico y reconciliación por método de pago
- Diferencias mayores a $50.000 CLP requieren confirmación de administrador

### Cocina (`/cocina`)
- Pantalla en tiempo real con Supabase Realtime + polling de respaldo
- Columnas: Pendientes / En preparación
- Al marcar listo, dispara un webhook → notificación WhatsApp al cliente

### Tienda web (`/`)
- Catálogo público con categorías, variantes y modificadores
- Carrito persistente y checkout con nombre y teléfono
- Seguimiento del estado de la orden

### Administración
- CRUD de productos, categorías, variantes y modificadores
- Gestión de usuarios y roles
- Log de auditoría con valores anteriores/nuevos

## Estructura del proyecto

```
src/
├── app/
│   ├── layouts/        # AppShell (POS/admin), StorefrontShell (tienda)
│   ├── navigation.ts   # Menú por rol
│   └── router.tsx      # Rutas + guards de autenticación
├── components/
│   ├── ui/             # shadcn/ui base
│   ├── common/         # Componentes compartidos (MetricCard, LoadingState, etc.)
│   └── data-table/     # Tablas con TanStack Table
├── features/           # Módulos de negocio
│   ├── auth/           # Login, cambio de contraseña
│   ├── dashboard/      # Métricas del día
│   ├── sales/          # POS
│   ├── cash/           # Caja
│   ├── products/       # Catálogo (admin)
│   ├── users/          # Usuarios (admin)
│   ├── audit/          # Auditoría (admin)
│   ├── kitchen/        # Pantalla de cocina
│   └── storefront/     # Tienda web pública
├── lib/                # Supabase client, helpers de formato y negocio
├── stores/             # Estado global (Zustand)
└── types/              # Tipos del dominio y de Supabase
supabase/
├── schema.sql          # Esquema completo
├── seeds.sql           # Datos de prueba
└── *.sql               # Migraciones
```

## Seguridad

- Todas las tablas tienen **Row Level Security (RLS)** habilitado
- Los precios del storefront se validan **siempre desde la BD** — el cliente no puede manipular montos
- Los usuarios desactivados pierden acceso inmediatamente, aunque tengan sesión activa
- Las funciones críticas del storefront usan `SECURITY DEFINER` para operar sin exponer las tablas al rol `anon`
- La `anon key` de Supabase es pública por diseño; la seguridad real está en las políticas RLS y las funciones del servidor

## Próximas fases (arquitectura preparada)

La base de datos ya tiene tablas para:
- **Inventario** — ingredientes, recetas, movimientos, proveedores, compras
- **Despacho** — zonas de entrega, seguimiento de órdenes
- **RRHH** — empleados, ajustes, ciclos de nómina
- **Promociones** — combos, porcentajes, descuentos por horario
