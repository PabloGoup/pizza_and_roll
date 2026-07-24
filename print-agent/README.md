# Agente de impresión de cocina

El agente desacopla la impresora del navegador:

`Web/POS → cola Supabase → agente local → spooler RAW → impresora`

## Instalación guiada desde la web

Después de aplicar `supabase/add_print_agent_queue.sql`, un administrador puede
abrir **Impresión → Agregar computador**, indicar un nombre y descargar el
instalador personalizado.

- Windows: abrir el archivo `.cmd` descargado y aceptar el permiso de
  administrador. El instalador usa Windows Package Manager para instalar
  Node.js LTS si todavía no está disponible.
- macOS: abrir el archivo `.command`. Si Node.js no está instalado, el
  instalador abre su descarga oficial y solicita volver a ejecutarlo.

El agente queda registrado para iniciar con el sistema. En menos de 20 segundos
el computador y sus colas instaladas aparecen en **Agregar impresora**. La
impresora solo se activa cuando el administrador la confirma desde el panel.

Cada navegador guarda su estación de impresión elegida. Los trabajos quedan
dirigidos a ese agente, de modo que varios computadores no compiten por la
misma comanda.

La cola conserva los trabajos aunque la web, el agente o el computador se
reinicien. Cada trabajo se reclama de forma atómica, se reintenta con espera
progresiva y solo se marca impreso después de que el sistema operativo acepta
todos sus bytes.

## 1. Crear las tablas y funciones

Ejecuta `supabase/add_print_agent_queue.sql` una sola vez en Supabase SQL
Editor. La migración no reimprime pedidos históricos.

## 2. Crear la identidad del agente

Con una sesión de administrador abierta, ejecuta en Supabase:

```sql
select public.create_print_agent('cocina-principal');
```

Guarda el `token` devuelto: Supabase solo muestra ese valor en esa ejecución.
Repetir la función renueva el token e invalida el anterior.

## 3. Configurar

Copia `print-agent/.env.example` a `print-agent/.env` y completa:

- URL y clave pública de Supabase.
- Nombre y token generados.
- Nombre exacto de la impresora instalada en macOS o Windows.

Prueba en primer plano:

```bash
npm run print-agent:start
```

## 4. Inicio automático

### macOS

```bash
chmod +x print-agent/install-macos.sh
./print-agent/install-macos.sh
```

Se instala como LaunchAgent, se inicia al abrir sesión y se reinicia si falla.

### Windows

Abre PowerShell como administrador:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\print-agent\install-windows.ps1
```

Se instala como tarea de sistema `PizzaAndRollPrintAgent`, arranca con Windows
aunque ningún usuario haya iniciado sesión y se reinicia automáticamente.
Node.js debe estar instalado en el computador de cocina.

## Operación

- Un pedido nuevo se encola automáticamente al crear su ticket de cocina.
- Una edición genera una comanda `COMANDA MODIFICADA`.
- Reimprimir genera un trabajo nuevo; nunca reutiliza el anterior.
- El agente consulta cada 800 ms y reclama hasta tres trabajos por vuelta.
- Los registros quedan en `print-agent/print-agent.log` si esa ruta está
  configurada.
- Un trabajo fallido se reintenta hasta ocho veces. Después queda visible con
  estado `failed` y su error en `print_jobs.last_error`.

El agente no usa la clave `service_role`; el token solo autoriza las funciones
de impresión y puede revocarse desde `print_agents`.

## Configuración remota

Una vez instalado, el agente reporta cada diez segundos:

- Estado conectado o desconectado.
- Nombre del computador y sistema operativo.
- Impresoras que macOS o Windows ya tienen instaladas.
- Configuración aplicada.

Desde **Ventas → Impresora** un administrador puede seleccionar el computador,
cambiar la impresora, ancho de papel, tamaño de texto, caracteres por línea,
avance final y activar o pausar el agente. No es necesario reiniciar el agente.

El navegador no accede directamente al USB: consulta la lista que reporta el
agente. Por eso funciona también cuando el administrador configura la cocina
desde otro lugar a través de internet.
