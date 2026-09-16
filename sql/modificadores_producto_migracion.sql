-- ============================================================================
-- MODIFICADORES DE PRODUCTO / NOTAS DE COCINA — migración aditiva
-- Ejecuta esto en el SQL Editor de Supabase. No modifica ni borra ninguna
-- columna existente — solo agrega una nueva.
--
-- Nota de transparencia: 'detalle_ventas' ya tenía una columna 'notas' (se
-- sigue usando igual que antes, sin tocarla). 'kitchen_notes' es un campo
-- NUEVO y separado, específicamente para los tags rápidos de exclusión
-- (Sin Queso, Sin Cebolla, etc.) que pide esta funcionalidad.
-- ============================================================================

alter table public.detalle_ventas
    add column if not exists kitchen_notes text;

-- ----------------------------------------------------------------------------
-- Actualización aditiva de push_sync_ventas: agrega la lectura de
-- 'kitchen_notes' del payload al insertar el detalle. El resto de la función
-- queda EXACTAMENTE igual que en schema.sql — mismo flujo, mismos parámetros,
-- mismo comportamiento de ON CONFLICT y de no-duplicado.
-- ----------------------------------------------------------------------------

create or replace function public.push_sync_ventas(payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
    venta jsonb;
    item jsonb;
    v_id uuid;
    resultado jsonb := '[]'::jsonb;
begin
    for venta in select * from jsonb_array_elements(payload)
    loop
        v_id := (venta->>'id')::uuid;

        insert into public.ventas (
            id, cliente_id, cajero_id, tipo_ecf, ncf,
            subtotal, itbis, total, metodo_pago,
            monto_efectivo, monto_tarjeta, estado,
            is_synced, created_at_local
        )
        values (
            v_id,
            nullif(venta->>'cliente_id','')::uuid,
            nullif(venta->>'cajero_id','')::uuid,
            (venta->>'tipo_ecf')::tipo_ecf,
            venta->>'ncf',
            (venta->>'subtotal')::numeric,
            (venta->>'itbis')::numeric,
            (venta->>'total')::numeric,
            (venta->>'metodo_pago')::metodo_pago,
            coalesce((venta->>'monto_efectivo')::numeric, 0),
            coalesce((venta->>'monto_tarjeta')::numeric, 0),
            'COMPLETADA',
            true,
            coalesce((venta->>'created_at_local')::timestamptz, now())
        )
        on conflict (id) do update set
            is_synced = true,
            ncf = excluded.ncf
        returning id into v_id;

        for item in select * from jsonb_array_elements(venta->'items')
        loop
            -- ÚNICO CAMBIO respecto a schema.sql: se agrega la columna
            -- 'kitchen_notes' a la lista de columnas y valores insertados.
            insert into public.detalle_ventas (
                venta_id, producto_id, cantidad, precio_unitario, notas, kitchen_notes
            )
            select
                v_id,
                (item->>'producto_id')::uuid,
                (item->>'cantidad')::numeric,
                (item->>'precio_unitario')::numeric,
                item->>'notas',
                item->>'kitchen_notes'
            where not exists (
                select 1 from public.detalle_ventas dv
                where dv.venta_id = v_id
                and dv.producto_id = (item->>'producto_id')::uuid
                and dv.cantidad = (item->>'cantidad')::numeric
            );
        end loop;

        resultado := resultado || jsonb_build_object(
            'id', v_id,
            'synced', true,
            'server_created_at', now()
        );
    end loop;

    return resultado;
end;
$$;

grant execute on function public.push_sync_ventas(jsonb) to authenticated, anon;
