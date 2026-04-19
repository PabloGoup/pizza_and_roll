# P&R_ventas

Sistema POS + administración para negocio gastronómico, construido con:

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- TanStack Table
- React Query
- Zustand
- Recharts
- Supabase

## Estado actual

Fase 1 implementada:

- autenticación y roles
- layout principal responsive
- dashboard inicial
- caja
- ventas / POS
- productos
- usuarios
- auditoría
- esquema SQL y seeds base de Supabase

Fases 2 y 3 quedaron preparadas a nivel de arquitectura y base de datos.

## Cómo correr localmente

1. Instala dependencias:

```bash
npm install
```

2. Crea variables locales:

```bash
cp .env.example .env.local
```

- Crea un proyecto en Supabase.
- Ejecuta `supabase/schema.sql`.
- Ejecuta `supabase/seeds.sql`.
- Completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `.env.local`.
- Crea usuarios en Supabase Auth y asigna roles en `public.profiles`.

4. Inicia desarrollo:

```bash
npm run dev
```

5. Validación de build:

```bash
npm run build
```

## Estructura

```text
src/
  app/
  components/
  features/
  hooks/
  lib/
  stores/
  types/
supabase/
  schema.sql
  seeds.sql
docs/
  architecture.md
```

## Notas técnicas

- La app opera ahora sólo con datos reales de Supabase.
- El frontend está desacoplado por módulos para continuar con cocina, despacho, reportes, inventario y RRHH.
- La creación de usuarios productiva debe pasar por una Edge Function o backend seguro; el frontend no debe usar credenciales de servicio.
