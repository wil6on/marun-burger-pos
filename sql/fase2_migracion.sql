-- ============================================================================
-- FASE 2 — MIGRACIÓN: anular ventas (con devolución automática de inventario),
-- retiros de caja, y función de cierre de turno.
--
-- Ejecuta esto DESPUÉS de fase1_migracion.sql. Es seguro correrlo con datos
-- existentes — no borra nada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Anular una venta — cambia su estado y devuelve los insumos consumidos
-- al inventario automáticamente, dejando el rastro en el kardex.
-- ----------------------------------------------------------------------------

create or replace function public.anular_venta(p_venta_id uuid)
returns void
language plpgsql
security definer
as $$
declare
    v_estado_actual estado_venta;
begin
    select estado into v_estado_actual from public.ventas where id = p_venta_id;

    if v_estado_actual is null then
        raise exception 'Venta no encontrada';
    end if;

    if v_estado_actual = 'ANULADA' then
        raise exception 'Esta venta ya estaba anulada';
    end if;

    -- Devolver al inventario cada insumo que esta venta había descontado
    insert into public.inventory_movements (insumo_id, tipo, cantidad, motivo, venta_id)
    select r.insumo_id, 'ENTRADA', sum(r.cantidad_requerida * dv.cantidad),
           'Devolución por anulación de venta', p_venta_id
    from public.detalle_ventas dv
    join public.recetas r on r.producto_id = dv.producto_id
    where dv.venta_id = p_venta_id
    group by r.insumo_id;

    update public.insumos i
    set stock_actual = i.stock_actual + sub.cantidad_total,
        updated_at = now()
    from (
        select r.insumo_id, sum(r.cantidad_requerida * dv.cantidad) as cantidad_total
        from public.detalle_ventas dv
        join public.recetas r on r.producto_id = dv.producto_id
        where dv.venta_id = p_venta_id
        group by r.insumo_id
    ) sub
    where i.id = sub.insumo_id;

    update public.ventas set estado = 'ANULADA' where id = p_venta_id;
end;
$$;

grant execute on function public.anular_venta(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) Retiros de caja durante un turno
-- ----------------------------------------------------------------------------

create table if not exists public.cash_register_withdrawals (
    id uuid primary key default uuid_generate_v4(),
    cash_register_id uuid not null references public.cash_registers(id) on delete cascade,
    monto numeric(12,2) not null check (monto > 0),
    motivo text,
    created_at timestamptz not null default now()
);

alter table public.cash_register_withdrawals enable row level security;

-- Nota de diseño: el POS de caja hoy NO pide login al cajero (por diseño,
-- para que cualquiera pueda cobrar sin fricción en el mostrador — igual que
-- 'ventas'). Por eso esta política es abierta, igual que 'ventas_insert_pos'
-- y 'detalle_insert_pos' del schema original — no es un descuido.
create policy "cash_register_withdrawals_pos_access"
on public.cash_register_withdrawals for all
using (true)
with check (true);

-- ----------------------------------------------------------------------------
-- 3) Ajuste a la política de 'cash_registers' de la Fase 1
--
-- La política original ("cajero_id = auth.uid()") en la práctica bloqueaba
-- TODO acceso, porque el POS no autentica cajeros — auth.uid() siempre es
-- null ahí, y "null = null" nunca es verdadero en SQL. La corrijo para que
-- siga el mismo modelo abierto que 'ventas' (terminal físico de confianza).
-- ----------------------------------------------------------------------------

drop policy if exists "cash_registers_cajero_propio" on public.cash_registers;

create policy "cash_registers_pos_access"
on public.cash_registers for all
using (true)
with check (true);

alter table public.cash_registers
    add column if not exists cajero_nombre text;

-- ----------------------------------------------------------------------------
-- 4) Cerrar turno — calcula el total proyectado y la diferencia contra lo
-- declarado por el cajero, y marca el turno como cerrado.
-- ----------------------------------------------------------------------------

create or replace function public.cerrar_turno(
    p_turno_id uuid,
    p_monto_final_declarado numeric
)
returns public.cash_registers
language plpgsql
security definer
as $$
declare
    v_turno public.cash_registers;
    v_ventas_efectivo numeric;
    v_retiros numeric;
    v_total_proyectado numeric;
begin
    select * into v_turno from public.cash_registers where id = p_turno_id;

    if v_turno.id is null then
        raise exception 'Turno no encontrado';
    end if;
    if v_turno.estado = 'cerrado' then
        raise exception 'Este turno ya está cerrado';
    end if;

    select coalesce(sum(monto_efectivo), 0) into v_ventas_efectivo
    from public.ventas
    where created_at >= v_turno.abierto_at
      and estado <> 'ANULADA';

    select coalesce(sum(monto), 0) into v_retiros
    from public.cash_register_withdrawals
    where cash_register_id = p_turno_id;

    v_total_proyectado := v_turno.monto_inicial + v_ventas_efectivo - v_retiros;

    update public.cash_registers
    set estado = 'cerrado',
        cerrado_at = now(),
        monto_final_declarado = p_monto_final_declarado,
        total_ventas_efectivo = v_ventas_efectivo,
        diferencia = p_monto_final_declarado - v_total_proyectado
    where id = p_turno_id
    returning * into v_turno;

    return v_turno;
end;
$$;

grant execute on function public.cerrar_turno(uuid, numeric) to authenticated, anon;

-- ============================================================================
-- FIN DE LA MIGRACIÓN FASE 2
-- ============================================================================
