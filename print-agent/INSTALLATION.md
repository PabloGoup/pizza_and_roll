# Instalación del agente de impresión

El agente conecta la web de Pizza and Roll con las impresoras instaladas en un
computador de cocina. Solo debe instalarse una vez en cada computador que tendrá
una impresora conectada.

Esta guía y el archivo `README.md` se distribuyen junto con el instalador:

- En Windows quedan en la carpeta de instalación y en el menú Inicio.
- En macOS se descargan fuera del paquete `.pkg`, dentro de la carpeta
  `Pizza-and-Roll-Impresion-macOS`, para poder leer las instrucciones antes de
  autorizar el instalador. También se incluye `LEEME-ANTES-DE-INSTALAR.txt` con
  los pasos rápidos.

## Antes de comenzar

- Instala primero el controlador de la impresora.
- Comprueba que el computador pueda imprimir una página de prueba.
- Mantén abierta la web en **Impresión → Agregar computador**.
- El código de vinculación dura 15 minutos. Si vence, genera uno nuevo.

## macOS

1. En la web selecciona **Agregar computador**.
2. Escribe un nombre reconocible, por ejemplo `Cocina principal`.
3. Selecciona **macOS** y descarga `Pizza-and-Roll-Impresion-macOS.zip`.
4. Abre la carpeta descargada y lee primero `LEEME-ANTES-DE-INSTALAR.txt`.
5. Verifica que `Pizza-and-Roll-Impresion.pkg` pese más de 20 MB. Un archivo de pocos KB está
   incompleto y debe eliminarse.
6. Abre el paquete, presiona **Instalar** y autentícate con la contraseña o
   Touch ID del Mac.
7. Al finalizar se abrirá **Pizza and Roll - Impresión**. Ingresa el código de
   ocho caracteres mostrado en la web.
8. Espera unos segundos y confirma que el computador aparezca **En línea** en
   el panel de impresión.

### Si Apple bloquea el paquete

Mientras el instalador no tenga una firma Apple Developer, macOS puede bloquear
su primera apertura.

Primero intenta:

1. Abrir el paquete una vez y cerrar la advertencia con **Listo**.
2. Ir a **Configuración del Sistema → Privacidad y seguridad**.
3. En **Seguridad**, presionar **Abrir igualmente**.
4. Confirmar con Touch ID o la contraseña del Mac.

Si el botón no aparece, abre Terminal y autoriza solamente el archivo
descargado:

```bash
cd "$HOME/Downloads/Pizza-and-Roll-Impresion-macOS"
xattr -dr com.apple.quarantine "Pizza-and-Roll-Impresion.pkg"
open "Pizza-and-Roll-Impresion.pkg"
```

Esto no desactiva la seguridad global del Mac. Solo retira la cuarentena del
paquete indicado.

## Windows

1. En la web selecciona **Agregar computador**.
2. Escribe un nombre reconocible y selecciona **Windows**.
3. Descarga y abre `Pizza-and-Roll-Impresion-Setup.exe`.
4. Acepta el permiso de administrador.
5. Ingresa el código de ocho caracteres mostrado en la web.
6. Espera unos segundos y confirma que el computador aparezca **En línea**.

Windows puede mostrar SmartScreen mientras el ejecutable no tenga un
certificado de firma de código. En un equipo administrado, el responsable debe
autorizar el instalador oficial de Pizza and Roll.

## Elegir la impresora

Cuando el computador esté conectado:

1. Abre **Impresión → Agregar impresora**.
2. Selecciona el computador.
3. Elige una de las impresoras que reporta ese equipo.
4. Presiona **Agregar impresora**.
5. Usa **Usar en este navegador** para dirigir las comandas creadas desde ese
   navegador a esa estación.

## Uso desde teléfonos y tablets

La web puede utilizarse desde iPhone, iPad o Android para tomar pedidos,
reimprimir y enviar comandas. La impresión sigue este recorrido:

`Móvil → cola en Supabase → computador de cocina → impresora`

Requisitos:

- El computador de cocina debe permanecer encendido, conectado a internet y
  con el agente **En línea**.
- La impresora debe estar conectada a ese computador.
- En el navegador móvil se debe seleccionar la estación mediante **Usar en este
  navegador**.

No es necesario instalar el agente en el teléfono. Un navegador móvil no puede
controlar directamente una impresora USB de escritorio. La impresión directa
por Bluetooth desde el teléfono requeriría una aplicación móvil nativa y es un
flujo diferente.

## Comprobaciones rápidas

- **Computador desconectado:** revisa internet y reinicia el computador.
- **No aparecen impresoras:** verifica que el controlador esté instalado y que
  la impresora exista en las preferencias del sistema.
- **Código vencido:** genera otro desde **Agregar computador**.
- **No imprime:** revisa la actividad reciente y el estado de la cola en el
  panel de impresión.
- **Paquete macOS demasiado pequeño:** elimina la descarga y vuelve a obtener
  el instalador; debe pesar más de 20 MB.
