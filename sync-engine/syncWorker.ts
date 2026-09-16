// ============================================================================
// syncWorker.ts — Motor de sincronización en background
// Detecta conectividad, envía ventas pendientes (is_synced: false) a Supabase
// mediante la función RPC push_sync_ventas, y reconcilia el estado local.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
    obtenerVentasPendientes,
    marcarVentasComoSincronizadas,
    incrementarIntentosSync,
    guardarProductosCache,
    guardarCategoriasCache,
    VentaLocal,
    ProductoCache,
    CategoriaCache,
} from './localDb';

let supabase: SupabaseClient | null = null;
let avisoConfigMostrado = false;

/**
 * Crea (o reutiliza) el cliente de Supabase. Si faltan las variables de
 * entorno, NO lanza una excepción sin control (eso es lo que antes tumbaba
 * toda la app con una pantalla roja de "Runtime Error") — en vez de eso,
 * avisa una sola vez por consola y devuelve null, para que el resto del
 * sistema siga funcionando en modo offline con lo que ya tenga en cache.
 */
function getSupabaseClient(): SupabaseClient | null {
    if (supabase) return supabase;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
        if (!avisoConfigMostrado) {
            console.error(
                '[SyncWorker] Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
                'Revisa que exista el archivo .env.local en la raíz del proyecto (junto a package.json) ' +
                'con esas dos variables, y REINICIA el servidor (detén "npm run dev" con Ctrl+C y ' +
                'vuelve a correrlo) — Next.js solo lee ese archivo al arrancar, no en caliente.'
            );
            avisoConfigMostrado = true;
        }
        return null;
    }

    try {
        supabase = createClient(url, anonKey);
        return supabase;
    } catch (err) {
        console.error('[SyncWorker] No se pudo crear el cliente de Supabase:', err);
        return null;
    }
}

const MAX_INTENTOS = 5;
const INTERVALO_SYNC_MS = 15_000; // reintenta cada 15s mientras haya red
let intervalHandle: ReturnType<typeof setInterval> | null = null;

// --- Serialización de la venta local al payload que espera la RPC -----------

function ventaToPayload(venta: VentaLocal) {
    return {
        id: venta.id,
        cliente_id: venta.cliente_id,
        cliente_nombre: venta.cliente_nombre ?? null,
        cliente_rnc_cedula: venta.cliente_rnc_cedula ?? null,
        cajero_id: venta.cajero_id,
        tipo_ecf: venta.tipo_ecf,
        ncf: venta.ncf,
        subtotal: venta.subtotal,
        itbis: venta.itbis,
        total: venta.total,
        metodo_pago: venta.metodo_pago,
        monto_efectivo: venta.monto_efectivo,
        monto_tarjeta: venta.monto_tarjeta,
        created_at_local: venta.created_at_local,
        items: venta.items.map((it) => ({
            producto_id: it.producto_id,
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            notas: it.notas ?? null,
            kitchen_notes: it.kitchen_notes ?? null,
        })),
    };
}

// --- Envío de un batch de ventas pendientes ----------------------------------

export async function sincronizarVentasPendientes(): Promise<{
    exito: number;
    fallidas: number;
}> {
    const pendientes = await obtenerVentasPendientes();
    if (pendientes.length === 0) return { exito: 0, fallidas: 0 };

    const aEnviar = pendientes.filter((v) => v.sync_attempts < MAX_INTENTOS);
    if (aEnviar.length === 0) return { exito: 0, fallidas: pendientes.length };

    const client = getSupabaseClient();
    if (!client) return { exito: 0, fallidas: aEnviar.length };

    const payload = aEnviar.map(ventaToPayload);

    try {
        const { data, error } = await client.rpc('push_sync_ventas', { payload });

        if (error) {
            console.error('[SyncWorker] Error en push_sync_ventas:', error.message);
            await incrementarIntentosSync(aEnviar.map((v) => v.id));
            return { exito: 0, fallidas: aEnviar.length };
        }

        const idsConfirmados: string[] = (data ?? []).map((r: { id: string }) => r.id);
        await marcarVentasComoSincronizadas(idsConfirmados);

        console.info(`[SyncWorker] ${idsConfirmados.length} venta(s) sincronizada(s).`);
        return { exito: idsConfirmados.length, fallidas: aEnviar.length - idsConfirmados.length };
    } catch (err) {
        console.error('[SyncWorker] Excepción de red durante sync:', err);
        await incrementarIntentosSync(aEnviar.map((v) => v.id));
        return { exito: 0, fallidas: aEnviar.length };
    }
}

// --- Descarga de catálogo de productos para cache offline --------------------

export async function refrescarCacheProductos(): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    try {
        const { data, error } = await client
            .from('productos')
            .select('id, categoria_id, nombre, precio, aplica_itbis, agotado, imagen_url, activo, updated_at')
            .eq('activo', true);

        if (error) {
            console.warn('[SyncWorker] No se pudo refrescar cache de productos:', error.message);
            return;
        }

        if (data) await guardarProductosCache(data as ProductoCache[]);
    } catch (err) {
        console.error('[SyncWorker] Excepción al refrescar productos:', err);
    }
}

// --- Descarga de categorías para armar las pestañas del POS -----------------

export async function refrescarCacheCategorias(): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    try {
        const { data, error } = await client
            .from('categorias')
            .select('id, nombre, orden, activo')
            .eq('activo', true)
            .order('orden', { ascending: true });

        if (error) {
            console.warn('[SyncWorker] No se pudo refrescar cache de categorías:', error.message);
            return;
        }

        if (data) await guardarCategoriasCache(data as CategoriaCache[]);
    } catch (err) {
        console.error('[SyncWorker] Excepción al refrescar categorías:', err);
    }
}

// --- Orquestador: arranca el ciclo de sincronización -------------------------

export function iniciarSyncWorker(onStatusChange?: (status: 'online' | 'offline' | 'syncing') => void) {
    if (typeof window === 'undefined') return; // solo corre en cliente

    const ejecutarCicloSync = async () => {
        if (!navigator.onLine) {
            onStatusChange?.('offline');
            return;
        }
        onStatusChange?.('syncing');
        try {
            await sincronizarVentasPendientes();
            await refrescarCacheProductos();
            await refrescarCacheCategorias();
        } catch (err) {
            // Última red de seguridad: pase lo que pase adentro del ciclo de
            // sync, nunca debe tumbar la pantalla del cajero con una pantalla
            // roja de error mientras está cobrando.
            console.error('[SyncWorker] Error inesperado en el ciclo de sincronización:', err);
        }
        onStatusChange?.('online');
    };

    // Sync inmediato al recuperar conexión
    window.addEventListener('online', ejecutarCicloSync);
    window.addEventListener('offline', () => onStatusChange?.('offline'));

    // Polling periódico (cubre reconexiones silenciosas que no disparan 'online')
    if (intervalHandle) clearInterval(intervalHandle);
    intervalHandle = setInterval(ejecutarCicloSync, INTERVALO_SYNC_MS);

    // Primer intento al montar
    ejecutarCicloSync();

    return () => {
        window.removeEventListener('online', ejecutarCicloSync);
        if (intervalHandle) clearInterval(intervalHandle);
    };
}
