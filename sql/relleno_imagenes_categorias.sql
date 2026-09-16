-- ============================================================================
-- RELLENO DE IMÁGENES POR CATEGORÍA (solo para productos sin imagen)
-- Ejecuta esto en el SQL Editor de Supabase.
--
-- Son fotos GENÉRICAS de Unsplash (licencia libre, uso comercial permitido,
-- sin atribución requerida) — no son fotos de tus platillos reales. Sirven
-- como respaldo visual mientras subes tus propias fotos (ya tienes la
-- función de subida en /admin → Menú → "Foto del platillo").
--
-- Solo toca productos donde imagen_url IS NULL — si un producto ya tiene
-- foto (la tuya o una anterior), esto NO la sobrescribe.
-- ============================================================================

-- Bebidas
update public.productos p
set imagen_url = 'https://images.unsplash.com/photo-1746648858222-275796698c20?w=600&auto=format&fit=crop&q=60'
from public.categorias c
where p.categoria_id = c.id
  and p.imagen_url is null
  and c.nombre ilike '%bebida%';

-- Sandwich
update public.productos p
set imagen_url = 'https://images.unsplash.com/photo-1469648034646-7911874fe62b?w=600&auto=format&fit=crop&q=60'
from public.categorias c
where p.categoria_id = c.id
  and p.imagen_url is null
  and c.nombre ilike '%sandwich%';

-- Burritos
update public.productos p
set imagen_url = 'https://images.unsplash.com/photo-1711488735428-27c6757beb5c?w=600&auto=format&fit=crop&q=60'
from public.categorias c
where p.categoria_id = c.id
  and p.imagen_url is null
  and c.nombre ilike '%burrito%';

-- Yaroas y Papas (papas fritas con queso — cubre "Yaroa de Papa" y
-- "Guarniciones" con productos de papa)
update public.productos p
set imagen_url = 'https://images.unsplash.com/photo-1639744210631-209fce3e256c?w=600&auto=format&fit=crop&q=60'
from public.categorias c
where p.categoria_id = c.id
  and p.imagen_url is null
  and (c.nombre ilike '%yaroa%' or c.nombre ilike '%guarnici%' or p.nombre ilike '%papa%');

-- Quesadillas (comida mexicana)
update public.productos p
set imagen_url = 'https://images.unsplash.com/photo-1719957770167-bb66133ba808?w=600&auto=format&fit=crop&q=60'
from public.categorias c
where p.categoria_id = c.id
  and p.imagen_url is null
  and c.nombre ilike '%quesadilla%';

-- Verificación: productos que sigan sin imagen después de correr esto
-- (por ejemplo Plato de la Casa, Patacón — no pedidas explícitamente).
-- Corre esto aparte para revisar qué falta:
--
-- select p.nombre, c.nombre as categoria
-- from public.productos p
-- left join public.categorias c on c.id = p.categoria_id
-- where p.imagen_url is null;
