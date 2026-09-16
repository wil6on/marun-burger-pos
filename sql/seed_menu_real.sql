-- ============================================================================
-- CARGAR MENÚ REAL DE MARUN BURGER
-- Ejecuta esto en el SQL Editor de Supabase DESPUÉS de haber corrido schema.sql.
-- Esto BORRA las categorías/productos de ejemplo (Hamburguesas, Yaroas, Bebidas
-- demo) y carga tu menú real completo con los precios de tu carta.
-- ============================================================================

-- 1) Limpiar datos de ejemplo (ventas de prueba, productos y categorías demo)
delete from public.detalle_ventas;
delete from public.ventas;
delete from public.recetas;
delete from public.productos;
delete from public.categorias;

-- 2) Crear las categorías reales, en el orden en que aparecen en tu menú físico
insert into public.categorias (nombre, orden) values
    ('Plato de la Casa', 1),
    ('Patacón', 2),
    ('Sandwich', 3),
    ('Quesadilla', 4),
    ('Yaroa de Papa', 5),
    ('Guarniciones', 6),
    ('Hamburguesa', 7),
    ('Burritos', 8),
    ('Bebidas', 9);

-- 3) Cargar los productos reales con sus precios (en RD$)

-- Plato de la Casa
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Pechuga a la Plancha', 500, null from public.categorias where nombre = 'Plato de la Casa';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Alitas', 400, null from public.categorias where nombre = 'Plato de la Casa';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Filete de Pescado', 550, null from public.categorias where nombre = 'Plato de la Casa';

-- Patacón
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Plátano Maduro', 375, null from public.categorias where nombre = 'Patacón';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Plátano Verde', 375, null from public.categorias where nombre = 'Patacón';

-- Sandwich
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Completo', 150, null from public.categorias where nombre = 'Sandwich';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Marunsito', 250, null from public.categorias where nombre = 'Sandwich';

-- Quesadilla
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Quesadilla Pollo con Papa', 250, null from public.categorias where nombre = 'Quesadilla';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Quesadilla Res con Papa', 300, null from public.categorias where nombre = 'Quesadilla';

-- Yaroa de Papa (chica / grande como productos separados)
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Yaroa de Papa Res (Chica)', 300, null from public.categorias where nombre = 'Yaroa de Papa';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Yaroa de Papa Res (Grande)', 425, null from public.categorias where nombre = 'Yaroa de Papa';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Yaroa de Papa Pollo (Chica)', 250, null from public.categorias where nombre = 'Yaroa de Papa';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Yaroa de Papa Pollo (Grande)', 375, null from public.categorias where nombre = 'Yaroa de Papa';

-- Guarniciones
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Papa Sazonada', 100, null from public.categorias where nombre = 'Guarniciones';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Tostones', 100, null from public.categorias where nombre = 'Guarniciones';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Papa en Gajos', 120, null from public.categorias where nombre = 'Guarniciones';

-- Hamburguesa
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Clásica Marun', 300, 'Carne jugosa, queso, lechuga fresca, tomate y salsa especial Marun' from public.categorias where nombre = 'Hamburguesa';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Bacon BBQ Burgen', 400, 'Doble queso, aros de cebolla, bacon crujiente y salsa BBQ ahumada' from public.categorias where nombre = 'Hamburguesa';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Hawaina Especial', 375, 'Queso derretido, piña caramelizada y tocineta' from public.categorias where nombre = 'Hamburguesa';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Chicken Burger', 350, 'Queso americano, bacon, vegetales frescos y salsa ranch' from public.categorias where nombre = 'Hamburguesa';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Doble Cheese Burger', 450, 'Doble carne, doble queso cheddar y aros de cebolla' from public.categorias where nombre = 'Hamburguesa';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Marun Especial', 550, 'Triple carne, bacon, queso, vegetales frescos y salsa secreta de la casa' from public.categorias where nombre = 'Hamburguesa';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Angus Burgen', 575, 'Carne angus 80/20, bacon extra, aros de cebolla y muchísimo queso' from public.categorias where nombre = 'Hamburguesa';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'La Suprema de la Casa', 450, 'Carne, queso mozzarella y cheddar cheese sauce, bacon y papa suprema, vegetales' from public.categorias where nombre = 'Hamburguesa';

-- Burritos
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Burrito Pollo con Papa', 250, null from public.categorias where nombre = 'Burritos';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Burrito Res con Papa', 300, null from public.categorias where nombre = 'Burritos';

-- Bebidas
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Jugo Natural', 75, null from public.categorias where nombre = 'Bebidas';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Refresco', 50, null from public.categorias where nombre = 'Bebidas';
insert into public.productos (categoria_id, nombre, precio, descripcion)
select id, 'Agua', 25, null from public.categorias where nombre = 'Bebidas';

-- ============================================================================
-- NOTA: 'Mofongo' y 'Tuna con Amarillo' NO se cargaron porque en tu menú
-- físico no tienen precio definido (aparece '-'). Cuando definas el precio,
-- avísame o agrégalo tú mismo con:
--
-- insert into public.productos (categoria_id, nombre, precio)
-- select id, 'Mofongo', 000, ... -- coloca el precio real
-- from public.categorias where nombre = 'Plato de la Casa';
-- ============================================================================
