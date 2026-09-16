-- ============================================================================
-- MARUN BURGER POS — SCHEMA SUPABASE (PostgreSQL)
-- Offline-First / Sync Engine / RLS / Facturación e-CF (DGII) / Recetas
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================================================
-- 1. TIPOS ENUMERADOS
-- ============================================================================

create type unidad_medida as enum ('LBS', 'ONZ', 'UND', 'ML', 'LT', 'GR', 'KG');
create type tipo_ecf as enum ('CONSUMO', 'CREDITO_FISCAL');
create type metodo_pago as enum ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'MIXTO');
create type estado_venta as enum ('PENDIENTE', 'COMPLETADA', 'ANULADA');
create type rol_usuario as enum ('owner', 'pos');

-- ============================================================================
-- 2. TABLA: usuarios_app (perfil vinculado a auth.users)
-- ============================================================================

create table public.usuarios_app (
    id uuid primary key references auth.users(id) on delete cascade,
    nombre text not null,
    rol rol_usuario not null default 'pos',
    activo boolean not null default true,
    created_at timestamptz not null default now()
);

-- Helper: obtiene el rol del usuario autenticado actual
create or replace function public.rol_actual()
returns rol_usuario
language sql
security definer
stable
as $$
    select rol from public.usuarios_app where id = auth.uid();
$$;

-- ============================================================================
-- 3. TABLA: categorias
-- ============================================================================

create table public.categorias (
    id uuid primary key default uuid_generate_v4(),
    nombre text not null,
    orden int not null default 0,
    activo boolean not null default true,
    updated_at timestamptz not null default now()
);

-- ============================================================================
-- 4. TABLA: productos
-- ============================================================================

create table public.productos (
    id uuid primary key default uuid_generate_v4(),
    categoria_id uuid references public.categorias(id) on delete set null,
    nombre text not null,
    descripcion text,
    precio numeric(12,2) not null check (precio >= 0),
    aplica_itbis boolean not null default true,
    imagen_url text,
    activo boolean not null default true,
    updated_at timestamptz not null default now()
);

create index idx_productos_categoria on public.productos(categoria_id);
create index idx_productos_activo on public.productos(activo);

-- ============================================================================
-- 5. TABLA: insumos (materia prima)
-- ============================================================================

create table public.insumos (
    id uuid primary key default uuid_generate_v4(),
    nombre text not null,
    unidad unidad_medida not null,
    stock_actual numeric(12,3) not null default 0,
    stock_minimo numeric(12,3) not null default 0,
    costo_unitario numeric(12,4) not null default 0,
    updated_at timestamptz not null default now()
);

-- ============================================================================
-- 6. TABLA: recetas (pivote producto <-> insumo)
-- ============================================================================

create table public.recetas (
    id uuid primary key default uuid_generate_v4(),
    producto_id uuid not null references public.productos(id) on delete cascade,
    insumo_id uuid not null references public.insumos(id) on delete restrict,
    cantidad_requerida numeric(12,4) not null check (cantidad_requerida > 0),
    updated_at timestamptz not null default now(),
    unique (producto_id, insumo_id)
);

create index idx_recetas_producto on public.recetas(producto_id);

-- Vista de costeo: costo de producción vs precio de venta
create or replace view public.v_rentabilidad_productos as
select
    p.id as producto_id,
    p.nombre as producto,
    p.precio as precio_venta,
    coalesce(sum(r.cantidad_requerida * i.costo_unitario), 0) as costo_produccion,
    p.precio - coalesce(sum(r.cantidad_requerida * i.costo_unitario), 0) as margen,
    case when p.precio > 0
        then round(((p.precio - coalesce(sum(r.cantidad_requerida * i.costo_unitario), 0)) / p.precio) * 100, 2)
        else 0
    end as margen_pct
from public.productos p
left join public.recetas r on r.producto_id = p.id
left join public.insumos i on i.id = r.insumo_id
group by p.id, p.nombre, p.precio;

-- ============================================================================
-- 7. TABLA: clientes (para RNC/Cédula en e-CF)
-- ============================================================================

create table public.clientes (
    id uuid primary key default uuid_generate_v4(),
    nombre text not null default 'Consumidor Final',
    rnc_cedula text,
    telefono text,
    email text,
    updated_at timestamptz not null default now(),
    constraint chk_rnc_cedula_formato check (
        rnc_cedula is null or rnc_cedula ~ '^[0-9]{9}$' or rnc_cedula ~ '^[0-9]{11}$'
    )
);

-- ============================================================================
-- 8. TABLA: ventas (comandas / facturas)
-- ============================================================================

create table public.ventas (
    id uuid primary key default uuid_generate_v4(), -- generado offline (UUIDv4)
    numero_orden serial,
    cliente_id uuid references public.clientes(id) on delete set null,
    cajero_id uuid references public.usuarios_app(id) on delete set null,
    tipo_ecf tipo_ecf not null default 'CONSUMO',
    ncf text,
    subtotal numeric(12,2) not null check (subtotal >= 0),
    itbis numeric(12,2) not null check (itbis >= 0),
    total numeric(12,2) not null check (total >= 0),
    metodo_pago metodo_pago not null,
    monto_efectivo numeric(12,2) default 0,
    monto_tarjeta numeric(12,2) default 0,
    estado estado_venta not null default 'COMPLETADA',
    is_synced boolean not null default false,
    created_at_local timestamptz not null default now(), -- timestamp generado en el dispositivo
    created_at timestamptz not null default now()          -- timestamp autoritativo del servidor
);

create index idx_ventas_created_at on public.ventas(created_at desc);
create index idx_ventas_is_synced on public.ventas(is_synced);

-- ============================================================================
-- 9. TABLA: detalle_ventas
-- ============================================================================

create table public.detalle_ventas (
    id uuid primary key default uuid_generate_v4(),
    venta_id uuid not null references public.ventas(id) on delete cascade,
    producto_id uuid not null references public.productos(id) on delete restrict,
    cantidad numeric(12,2) not null check (cantidad > 0),
    precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
    notas text,
    created_at timestamptz not null default now()
);

create index idx_detalle_venta on public.detalle_ventas(venta_id);

-- ============================================================================
-- 10. FUNCIÓN: descuento_inventario_por_venta
--     Descuenta automáticamente los insumos según la receta del producto
-- ============================================================================

create or replace function public.descontar_inventario(p_venta_id uuid)
returns void
language plpgsql
security definer
as $$
begin
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
end;
$$;

-- Trigger: al insertar detalle de venta, descuenta inventario automáticamente
create or replace function public.trg_descontar_inventario()
returns trigger
language plpgsql
as $$
begin
    perform public.descontar_inventario(new.venta_id);
    return new;
end;
$$;

create trigger after_insert_detalle_venta
after insert on public.detalle_ventas
for each row execute function public.trg_descontar_inventario();

-- ============================================================================
-- 11. FUNCIÓN RPC: push_sync_ventas
--     Recibe un batch de ventas + detalle generadas offline y las sincroniza
--     sin duplicar (ON CONFLICT DO UPDATE), devolviendo confirmación al cliente.
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
    resultado jsonb := '[]'::jsonb;
begin
    -- payload esperado:
    -- [
    --   {
    --     "id": "uuid-generado-offline",
    --     "cliente_id": "...", "cajero_id": "...",
    --     "tipo_ecf": "CONSUMO", "ncf": "...",
    --     "subtotal": 100.00, "itbis": 18.00, "total": 118.00,
    --     "metodo_pago": "EFECTIVO", "monto_efectivo": 118.00, "monto_tarjeta": 0,
    --     "created_at_local": "2026-09-09T10:00:00Z",
    --     "items": [
    --       {"producto_id": "...", "cantidad": 2, "precio_unitario": 50, "notas": "sin cebolla"}
    --     ]
    --   }, ...
    -- ]

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

        -- Insertar detalle solo si no existe (evita duplicar líneas en reintentos)
        for item in select * from jsonb_array_elements(venta->'items')
        loop
            insert into public.detalle_ventas (
                venta_id, producto_id, cantidad, precio_unitario, notas
            )
            select
                v_id,
                (item->>'producto_id')::uuid,
                (item->>'cantidad')::numeric,
                (item->>'precio_unitario')::numeric,
                item->>'notas'
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

-- ============================================================================
-- 12. ROW LEVEL SECURITY (RLS)
-- ============================================================================

alter table public.categorias enable row level security;
alter table public.productos enable row level security;
alter table public.insumos enable row level security;
alter table public.recetas enable row level security;
alter table public.clientes enable row level security;
alter table public.ventas enable row level security;
alter table public.detalle_ventas enable row level security;
alter table public.usuarios_app enable row level security;

-- --- usuarios_app: cada quien ve/edita su propio perfil; owner ve todos
create policy "usuarios_select_propio_o_owner"
on public.usuarios_app for select
using (id = auth.uid() or public.rol_actual() = 'owner');

-- --- categorias: lectura pública de activas; solo owner escribe
create policy "categorias_select_activas"
on public.categorias for select
using (activo = true or public.rol_actual() = 'owner');

create policy "categorias_owner_write"
on public.categorias for all
using (public.rol_actual() = 'owner')
with check (public.rol_actual() = 'owner');

-- --- productos: cajeros solo ven activos; owner CRUD total
create policy "productos_select_activos_pos"
on public.productos for select
using (activo = true or public.rol_actual() = 'owner');

create policy "productos_owner_write"
on public.productos for all
using (public.rol_actual() = 'owner')
with check (public.rol_actual() = 'owner');

-- --- insumos y recetas: solo owner (información sensible de costos)
create policy "insumos_owner_only"
on public.insumos for all
using (public.rol_actual() = 'owner')
with check (public.rol_actual() = 'owner');

create policy "recetas_owner_only"
on public.recetas for all
using (public.rol_actual() = 'owner')
with check (public.rol_actual() = 'owner');

-- --- clientes: cajero puede insertar/leer para facturar; owner todo
create policy "clientes_insert_pos"
on public.clientes for insert
with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "clientes_select_todos"
on public.clientes for select
using (true);

create policy "clientes_owner_update"
on public.clientes for update
using (public.rol_actual() = 'owner');

-- --- ventas: cajero (anon/pos) solo INSERT; owner SELECT total (dashboard)
create policy "ventas_insert_pos"
on public.ventas for insert
with check (true); -- el POS inserta vía RPC push_sync_ventas (security definer)

create policy "ventas_select_owner"
on public.ventas for select
using (public.rol_actual() = 'owner' or cajero_id = auth.uid());

create policy "ventas_update_owner_solo_anular"
on public.ventas for update
using (public.rol_actual() = 'owner')
with check (public.rol_actual() = 'owner');

-- --- detalle_ventas: mismas reglas que ventas
create policy "detalle_insert_pos"
on public.detalle_ventas for insert
with check (true);

create policy "detalle_select_owner"
on public.detalle_ventas for select
using (
    public.rol_actual() = 'owner'
    or exists (
        select 1 from public.ventas v
        where v.id = detalle_ventas.venta_id and v.cajero_id = auth.uid()
    )
);

-- ============================================================================
-- 13. REALTIME: habilitar publicación para dashboard gerencial
-- ============================================================================

alter publication supabase_realtime add table public.ventas;
alter publication supabase_realtime add table public.detalle_ventas;
alter publication supabase_realtime add table public.insumos;

-- ============================================================================
-- 14. SEED MÍNIMO DE EJEMPLO (opcional — comentar en producción)
-- ============================================================================

insert into public.categorias (nombre, orden) values
    ('Hamburguesas', 1), ('Yaroas', 2), ('Bebidas', 3);

insert into public.insumos (nombre, unidad, stock_actual, stock_minimo, costo_unitario) values
    ('Pan', 'UND', 200, 30, 15.00),
    ('Carne Angus', 'LBS', 80, 10, 220.00),
    ('Papas', 'LBS', 150, 20, 45.00),
    ('Queso Cheddar', 'UND', 500, 50, 6.50);
