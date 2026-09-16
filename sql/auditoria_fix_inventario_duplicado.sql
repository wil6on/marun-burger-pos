-- ============================================================================
-- CORRECCIÓN CRÍTICA — Sobre-descuento de inventario en ventas multi-producto
--
-- BUG encontrado en auditoría: el trigger 'after_insert_detalle_venta' se
-- dispara una vez POR CADA línea de producto que se inserta en una venta.
-- La función que llamaba, 'descontar_inventario(venta_id)', recalculaba la
-- suma de TODOS los productos de la venta en cada disparo (no solo el nuevo)
-- y restaba ese total de nuevo — duplicando el descuento de los insumos de
-- los productos insertados primero, en cualquier venta con 2 o más productos.
--
-- Esta corrección hace que el trigger descuente SOLO la línea que se acaba
-- de insertar (usando NEW.producto_id y NEW.cantidad), eliminando por
-- completo la posibilidad de doble conteo. Es seguro ejecutar esto en una
-- base de datos ya en uso — solo reemplaza la lógica interna del trigger,
-- no borra nada.
-- ============================================================================

create or replace function public.trg_descontar_inventario()
returns trigger
language plpgsql
security definer
as $$
begin
    -- Descuenta SOLO los insumos de la receta del producto de ESTA línea,
    -- multiplicado por la cantidad de ESTA línea — nada de recalcular toda
    -- la venta de nuevo.
    update public.insumos i
    set stock_actual = i.stock_actual - (r.cantidad_requerida * new.cantidad),
        updated_at = now()
    from public.recetas r
    where r.producto_id = new.producto_id
      and i.id = r.insumo_id;

    -- Kardex: un registro por cada insumo que usa la receta de este producto
    insert into public.inventory_movements (insumo_id, tipo, cantidad, motivo, venta_id)
    select r.insumo_id, 'SALIDA', r.cantidad_requerida * new.cantidad, 'Venta', new.venta_id
    from public.recetas r
    where r.producto_id = new.producto_id;

    return new;
end;
$$;

-- El trigger 'after_insert_detalle_venta' ya apunta a esta función (creada
-- en schema.sql) — como se reemplaza con CREATE OR REPLACE, el trigger
-- existente adopta la lógica corregida automáticamente, sin necesidad de
-- volver a crearlo.

-- ----------------------------------------------------------------------------
-- Nota: la función 'descontar_inventario(uuid)' (usada antes por el trigger)
-- ya NO se usa desde el trigger, pero se deja intacta por si algún reporte o
-- proceso manual la invoca directamente. 'anular_venta' NO tiene este bug —
-- hace su propio cálculo agregado una sola vez por anulación, no por fila.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- CORRECCIÓN 2 — RLS bloqueaba la lectura de ventas en /caja (Cuadre de Caja)
--
-- BUG encontrado en auditoría: la pantalla /caja lee 'ventas' sin que el
-- cajero haya iniciado sesión (por diseño, igual que el resto del POS). La
-- política de lectura de 'ventas' ("ventas_select_owner") solo permite ver
-- filas al dueño logueado o a un cajero autenticado — pero como el POS no
-- autentica cajeros, esa condición nunca se cumple para el tráfico anónimo.
--
-- Efecto real: el número "Ventas en efectivo" en /caja SIEMPRE mostraba
-- RD$0.00 mientras el turno estaba abierto (aunque sí hubiera ventas),
-- porque RLS ocultaba todas las filas. Al CERRAR el turno, el total sí
-- salía correcto (esa función corre con privilegios elevados que ignoran
-- RLS) — generando una discrepancia confusa entre lo que se veía en vivo y
-- lo que aparecía al cerrar.
-- ============================================================================

create policy "ventas_select_pos_caja"
on public.ventas for select
using (true);

-- Nota de diseño: esto sigue el mismo modelo de confianza que ya existe
-- para 'ventas_insert_pos' (con check (true)) — el POS y el Cuadre de Caja
-- confían en el terminal físico, no en una sesión individual. No expone
-- nada que la app no pudiera insertar ya de por sí con la misma llave anon.
