# Informe diario de cierre

Esta función genera el PDF gerencial y lo envía al cerrar una caja. Las
credenciales permanecen en Supabase y nunca llegan al navegador.

## Configuración

1. Aplica la migración:
   `supabase/migrations/20260726090000_add_daily_cash_report_delivery.sql`.
2. Crea una cuenta y un dominio verificado en Resend.
3. Configura los secretos de la función:

```bash
supabase secrets set \
  RESEND_API_KEY=re_xxxxx \
  DAILY_REPORT_FROM_EMAIL=informes@tu-dominio.cl \
  DAILY_REPORT_LOGO_URL=https://tu-dominio.cl/logo.png
```

4. Despliega:

```bash
supabase functions deploy send-daily-cash-report
```

5. En la web, abre **Configuración → Informe diario**, habilita el envío y
   agrega los destinatarios.

`DAILY_REPORT_FROM_EMAIL` debe pertenecer a un dominio verificado por Resend.
`DAILY_REPORT_LOGO_URL` debe ser una URL pública HTTPS de una imagen PNG o JPG.

La tabla `daily_cash_report_deliveries` conserva estado, intentos y errores.
Un fallo de correo no revierte ni modifica el cierre contable.
