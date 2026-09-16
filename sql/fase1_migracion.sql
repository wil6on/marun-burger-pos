-- ============================================================================
-- FASE 1 — MIGRACIÓN: ITBIS desactivado (arquitectura "dormida"), Kardex de
-- inventario, tabla de turnos de caja, y estado "Agotado" en productos.
--
-- Ejecuta este archivo COMPLETO en el SQL Editor de Supabase, después de
-- schema.sql y seed_menu_real.sql. Es seguro correrlo aunque ya tengas datos
-- cargados — solo agrega columnas/tablas nuevas, no borra nada existente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) ITBIS → arquitectura "dormida"
--
-- En vez de un 18% fijo en el código, cada producto tiene su propia tasa de
-- impuesto (tax_rate), que HOY vale 0 para todos. El día que el negocio
-- decida facturar con impuesto, se reactiva producto por producto cambiando
-- este número — sin tocar código.
-- ----------------------------------------------------------------------------

alter table public.productos
    add column if not exists tax_rate numeric(5,4) not null default 0;

-- Todo lo existente queda en 0 (sin impuesto), sin importar lo que tuviera
-- 'aplica_itbis' antes. Esa columna vieja se queda en la tabla por si acaso,
-- pero ya no la usa ni el POS ni el panel — está "dormida" también.
update public.productos set tax_rate = 0;

-- 'ventas' ya tenía una columna 'itbis' (monto de impuesto cobrado). Le
-- agregamos la tasa aplicada en el momento de la venta, para que quede como
-- registro histórico auditable el día que se reactive el impuesto.
alter table public.ventas
    add column if not exists tax_rate_aplicado numeric(5,4) not null default 0;

-- ----------------------------------------------------------------------------
-- 2) Estado "Agotado" — el producto se queda visible en el POS pero no se
-- puede agregar al carrito.
-- ----------------------------------------------------------------------------

alter table public.productos
    add column if not exists agotado boolean not null default false;

-- ----------------------------------------------------------------------------
-- 3) inventory_movements (Kardex) — historial de cada entrada/salida/ajuste
-- de cada insumo, con la razón y (si aplica) la venta que lo generó.
-- ----------------------------------------------------------------------------

create type tipo_movimiento_inventario as enum ('ENTRADA', 'SALIDA', 'AJUSTE');

create table if not exists public.inventory_movements (
    id uuid primary key default uuid_generate_v4(),
    insumo_id uuid not null references public.insumos(id) on delete cascade,
    tipo tipo_movimiento_inventario not null,
    cantidad numeric(12,4) not null,
    motivo text,
    venta_id uuid references public.ventas(id) on delete set null,
    creado_por uuid references public.usuarios_app(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists idx_inventory_movements_insumo
    on public.inventory_movements(insumo_id, created_at desc);

alter table public.inventory_movements enable row level security;

create policy "inventory_movements_owner_only"
on public.inventory_movements for all
using (public.rol_actual() = 'owner')
with check (public.rol_actual() = 'owner');

-- Actualiza el trigger de descuento automático para que TAMBIÉN registre
-- cada descuento en el kardex (antes solo restaba el stock, sin dejar rastro).
create or replace function public.descontar_inventario(p_venta_id uuid)
returns void
language plpgsql
security definer
as $$
begin
    -- Restar el stock (igual que antes)
    update public.insumos i
    set stock_actual = i.stock_actual - sub.cantidad_total,
        updated_at = now()
    from (
        select r.insumo_id, sum(r.cantidad_requerida * dv.cantidad) as cantidad_total
        from public.detalle_ventas dv
        join public.recetas r on r.producto_id = dv.producto_id
        where dv.venta_id = p_venta_id
        group by r.insumo_id
    ) sub
    where i.id = sub.insumo_id;

    -- Dejar registro en el kardex de cada insumo descontado por esta venta
    insert into public.inventory_movements (insumo_id, tipo, cantidad, motivo, venta_id)
    select r.insumo_id, 'SALIDA', sum(r.cantidad_requerida * dv.cantidad), 'Venta', p_venta_id
    from public.detalle_ventas dv
    join public.recetas r on r.producto_id = dv.producto_id
    where dv.venta_id = p_venta_id
    group by r.insumo_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4) Función para ajustes manuales de inventario desde el panel (agregar
-- stock recibido, correcciones de conteo físico, mermas, etc.) — mantiene
-- 'insumos.stock_actual' e 'inventory_movements' siempre sincronizados.
-- ----------------------------------------------------------------------------

create or replace function public.ajustar_stock_insumo(
    p_insumo_id uuid,
    p_cantidad numeric,       -- positivo = entra stock, negativo = sale stock
    p_tipo tipo_movimiento_inventario,
    p_motivo text default null
)
returns void
language plpgsql
security definer
as $$
begin
    update public.insumos
    set stock_actual = stock_actual + p_cantidad,
        updated_at = now()
    where id = p_insumo_id;

    insert into public.inventory_movements (insumo_id, tipo, cantidad, motivo, creado_por)
    values (p_insumo_id, p_tipo, abs(p_cantidad), p_motivo, auth.uid());
end;
$$;

grant execute on function public.ajustar_stock_insumo(uuid, numeric, tipo_movimiento_inventario, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) cash_registers (Turnos de caja) — estructura de la tabla para esta fase.
-- La lógica de apertura/cierre (UI) llega en la Fase 2; aquí solo se prepara
-- la base de datos para que exista sin romper nada.
-- ----------------------------------------------------------------------------

create table if not exists public.cash_registers (
    id uuid primary key default uuid_generate_v4(),
    cajero_id uuid references public.usuarios_app(id) on delete set null,
    monto_inicial numeric(12,2) not null default 0,
    monto_final_declarado numeric(12,2),
    total_ventas_efectivo numeric(12,2),
    diferencia numeric(12,2),
    estado text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
    abierto_at timestamptz not null default now(),
    cerrado_at timestamptz
);

alter table public.cash_registers enable row level security;

create policy "cash_registers_cajero_propio"
on public.cash_registers for all
using (cajero_id = auth.uid() or public.rol_actual() = 'owner')
with check (cajero_id = auth.uid() or public.rol_actual() = 'owner');

-- ============================================================================
-- FIN DE LA MIGRACIÓN FASE 1
-- ============================================================================
