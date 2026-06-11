-- ─── Perfil de sistema para el bot de WhatsApp ───────────────────────
-- Ejecutar en producción UNA SOLA VEZ (es idempotente por ON CONFLICT).
-- Este perfil actúa como cashier_id cuando create_storefront_order
-- se llama desde el canal WhatsApp (source = 'whatsapp').
--
-- El UUID fijo debe coincidir con la variable de entorno:
--   WHATSAPP_BOT_CASHIER_ID=00000000-0000-0000-0000-000000000001
--
-- IMPORTANTE: si public.profiles referencia auth.users(id), crea primero un
-- usuario/perfil técnico válido desde el flujo administrativo de Supabase o usa
-- el UUID de un perfil de cajero existente dedicado al bot. No elimines la FK en
-- producción solo para insertar este registro.

INSERT INTO public.profiles (id, full_name, role, email)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Bot WhatsApp',
  'cajero',
  'bot@whatsapp.system'
)
ON CONFLICT (id) DO NOTHING;
