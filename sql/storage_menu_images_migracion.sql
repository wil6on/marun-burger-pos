-- ============================================================================
-- SUPABASE STORAGE — bucket 'menu-images' para fotos de platillos
-- Ejecuta esto en el SQL Editor de Supabase.
-- ============================================================================

-- 1) Crear el bucket (público para lectura — las fotos del menú deben verse
--    sin necesidad de login, ya que el POS las muestra a cualquier cajero).
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

-- 2) Políticas de acceso al bucket
drop policy if exists "menu_images_public_read" on storage.objects;
drop policy if exists "menu_images_owner_insert" on storage.objects;
drop policy if exists "menu_images_owner_update" on storage.objects;
drop policy if exists "menu_images_owner_delete" on storage.objects;

-- Cualquiera puede VER las imágenes (necesario para que el POS las muestre)
create policy "menu_images_public_read"
on storage.objects for select
using (bucket_id = 'menu-images');

-- Solo el dueño (logueado en /admin) puede subir/editar/borrar imágenes
create policy "menu_images_owner_insert"
on storage.objects for insert
with check (bucket_id = 'menu-images' and public.rol_actual() = 'owner');

create policy "menu_images_owner_update"
on storage.objects for update
using (bucket_id = 'menu-images' and public.rol_actual() = 'owner');

create policy "menu_images_owner_delete"
on storage.objects for delete
using (bucket_id = 'menu-images' and public.rol_actual() = 'owner');
