-- ============================================================================
-- PARCHE DE SEGURIDAD: v_rentabilidad_productos
-- Ejecuta esto en el SQL Editor de Supabase (después de schema.sql).
--
-- Por defecto, las vistas de PostgreSQL corren con los permisos de quien las
-- CREÓ, no de quien las consulta. Eso significaría que, en teoría, un cajero
-- podría llegar a ver los costos de insumos a través de esta vista, saltando
-- las políticas RLS que restringen 'insumos' y 'recetas' solo al dueño.
--
-- Esta línea obliga a que la vista respete los permisos de quien la consulta
-- (el cajero), así que si no tiene acceso a 'insumos'/'recetas' por RLS,
-- tampoco podrá ver el costo de producción a través de esta vista.
-- ============================================================================

alter view public.v_rentabilidad_productos set (security_invoker = true);
