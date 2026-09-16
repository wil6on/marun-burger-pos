-- ============================================================================
-- IMÁGENES TEMPORALES PARA EL MENÚ (banco de imágenes libres, Unsplash License)
-- Ejecuta esto en el SQL Editor de Supabase.
--
-- IMPORTANTE — sé honesto con esto: estas son fotos GENÉRICAS de bancos de
-- imágenes gratuitos (no son fotos de tus platillos reales). Las puse para
-- que el POS no se vea con espacios vacíos mientras consigues fotos propias.
-- En cuanto tengas fotos reales de tu comida, reemplázalas desde el Panel
-- del Dueño → pestaña "Menú" → editando el campo "Imagen (URL)" de cada
-- platillo (ahí puedes pegar la URL de la foto que subas a donde sea:
-- Google Drive, Imgur, tu propia web, etc. — cualquier URL pública sirve).
-- ============================================================================

-- Hamburguesas (foto genérica de cheeseburger — aplica a las que llevan queso/carne clásica)
update public.productos set imagen_url =
  'https://images.unsplash.com/photo-1603508102983-99b101395d1a?w=600&auto=format&fit=crop&q=60'
where nombre in ('Clásica Marun', 'Bacon BBQ Burgen', 'Hawaina Especial', 'Doble Cheese Burger',
                  'Marun Especial', 'Angus Burgen', 'La Suprema de la Casa');

-- Chicken Burger (misma foto genérica de burger, aplica igual)
update public.productos set imagen_url =
  'https://images.unsplash.com/photo-1603508102983-99b101395d1a?w=600&auto=format&fit=crop&q=60'
where nombre = 'Chicken Burger';

-- Alitas (foto real de alitas de pollo)
update public.productos set imagen_url =
  'https://images.unsplash.com/photo-1566918214014-a3b3e0132267?w=600&auto=format&fit=crop&q=60'
where nombre = 'Alitas';

-- ============================================================================
-- El resto de los platillos (Yaroas, Quesadillas, Patacón, Sandwich, Burritos,
-- Guarniciones, Bebidas, Pechuga, Filete de Pescado) se quedan sin imagen por
-- ahora — no encontré fotos de banco lo suficientemente fieles como para
-- ponértelas sin que se vean genéricas o engañosas. Para esos, usa el campo
-- "Imagen (URL)" en el Panel del Dueño con una foto real o una que tú elijas.
-- ============================================================================
