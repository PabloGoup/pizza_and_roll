-- PASO 1 — Ejecutar PRIMERO, solo esto, en una consulta separada.
-- PostgreSQL no permite usar un valor de enum nuevo en la misma
-- transacción en que fue creado. Ejecuta este script, espera que
-- confirme "Success", y luego ejecuta security_fixes.sql.

alter type public.app_role add value if not exists 'cocina';
