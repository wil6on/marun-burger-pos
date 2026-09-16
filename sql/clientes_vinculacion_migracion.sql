-- ============================================================================
-- VINCULACIÓN DE CLIENTES — migración aditiva
-- Ejecuta esto en el SQL Editor de Supabase, DESPUÉS de
-- modificadores_producto_migracion.sql (esta reemplaza push_sync_ventas de
-- nuevo, construyendo sobre esa versión — no pierde nada de lo anterior).
--
-- Qué hace: cuando el POS envía una venta con 'cliente_nombre' y/o
-- 'cliente_rnc_cedula', esta función busca si ya existe un cliente con ese
-- RNC/Cédula (o, si no hay RNC, con ese nombre exacto); si no existe, lo
-- crea. Así el ticket dice "Cliente: Wilson Herrera" Y además queda un
-- registro real en la tabla 'clientes' para futuro historial/reportes.
-- Si la venta no trae nombre ni RNC, cliente_id queda en null (se sigue
-- imprimiendo "Consumidor Final" en el ticket, como hasta ahora).
-- ============================================================================

create or replace function public.push_sync_ventas(payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
    venta jsonb;
    item jsonb;
    v_id uuid;
    v_cliente_id uuid;
    v_nombre_cliente text;
    v_rnc_cliente text;
    resultado jsonb := '[]'::jsonb;
begin
    for venta in select * from jsonb_array_elements(payload)
    loop
        v_id := (venta->>'id')::uuid;

        -- ------------------------------------------------------------------
        -- Resolver o crear el cliente (NUEVO en esta migración)
        -- ------------------------------------------------------------------
        v_cliente_id := nullif(venta->>'cliente_id', '')::uuid;
        v_nombre_cliente := nullif(trim(venta->>'cliente_nombre'), '');
        v_rnc_cliente := nullif(trim(venta->>'cliente_rnc_cedula'), '');

        if v_cliente_id is null and (v_nombre_cliente is not null or v_rnc_cliente is not null) then
            -- 1) Si trae RNC/Cédula, buscar por ese dato primero (más confiable)
            if v_rnc_cliente is not null then
                select id into v_cliente_id from public.clientes
                where rnc_cedula = v_rnc_cliente
                limit 1;
            end if;

            -- 2) Si no se encontró por RNC, buscar por nombre exacto
            if v_cliente_id is null and v_nombre_cliente is not null then
                select id into v_cliente_id from public.clientes
                where nombre = v_nombre_cliente
                limit 1;
            end if;

            -- 3) Si sigue sin existir, crearlo
            if v_cliente_id is null then
                insert into public.clientes (nombre, rnc_cedula)
                values (coalesce(v_nombre_cliente, 'Consumidor Final'), v_rnc_cliente)
                returning id into v_cliente_id;
            end if;
        end if;

        -- ------------------------------------------------------------------
        -- Resto de la función: EXACTAMENTE igual que en la migración anterior
        -- ------------------------------------------------------------------
        insert into public.ventas (
            id, cliente_id, cajero_id, tipo_ecf, ncf,
            subtotal, itbis, total, metodo_pago,
            monto_efectivo, monto_tarjeta, estado,
            is_synced, created_at_local
        )
        values (
            v_id,
            v_cliente_id,
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
