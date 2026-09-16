// ============================================================================
// localDb.ts — Capa de persistencia local (IndexedDB) para el POS offline-first
// Usa la librería "idb" (wrapper ligero sobre IndexedDB nativo)
// npm install idb
// ============================================================================

import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface VentaLocal {
    id: string; // UUIDv4 generado en el dispositivo
    numero_orden_local: number; // correlativo local, visible en el ticket antes de sincronizar
    cliente_id: string | null;
    cliente_nombre?: string; // nombre libre para el ticket; si no se llena, se imprime "Consumidor Final"
    cliente_rnc_cedula?: string; // NUEVO — para vincular/crear el registro en 'clientes' al sincronizar
    cajero_id: string | null;
    tipo_ecf: 'CONSUMO' | 'CREDITO_FISCAL';
    ncf: string | null;
    subtotal: number;
    itbis: number;
    total: number;
    metodo_pago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'MIXTO';
    monto_efectivo: number;
    monto_tarjeta: number;
    created_at_local: string; // ISO timestamp
    is_synced: boolean;
    sync_attempts: number;
    items: ItemVentaLocal[];
}

export interface ItemVentaLocal {
    producto_id: string;
    nombre_producto: string; // cache para imprimir ticket offline
    cantidad: number;
    precio_unitario: number;
    notas?: string; // sin tocar — campo existente, uso previo intacto
    kitchen_notes?: string; // NUEVO — modificadores/exclusiones para cocina (no afecta el precio)
}

export interface ProductoCache {
    id: string;
    categoria_id: string | null;
    nombre: string;
    precio: number;
    aplica_itbis: boolean; // Fase 1: en desuso, ver 'tax_rate' — se mantiene por compatibilidad
    agotado: boolean;
    imagen_url: string | null;
    activo: boolean;
    updated_at: string;
}

export interface CategoriaCache {
    id: string;
    nombre: string;
    orden: number;
    activo: boolean;
}

interface MarunBurgerDB extends DBSchema {
    ventas: {
        key: string;
        value: VentaLocal;
        indexes: { 'by-synced': number };
    };
    productos_cache: {
        key: string;
        value: ProductoCache;
    };
    categorias_cache: {
        key: string;
        value: CategoriaCache;
    };
    meta: {
        key: string;
        value: { key: string; value: number };
    };
}

const DB_NAME = 'marun_burger_pos';
const DB_VERSION = 2;

let dbInstance: IDBPDatabase<MarunBurgerDB> | null = null;

export async function getDb(): Promise<IDBPDatabase<MarunBurgerDB>> {
    if (dbInstance) return dbInstance;

    dbInstance = await openDB<MarunBurgerDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains('ventas')) {
                const store = db.createObjectStore('ventas', { keyPath: 'id' });
                store.createIndex('by-synced', 'is_synced' as keyof VentaLocal);
            }
            if (!db.objectStoreNames.contains('productos_cache')) {
                db.createObjectStore('productos_cache', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('categorias_cache')) {
                db.createObjectStore('categorias_cache', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('meta')) {
                db.createObjectStore('meta', { keyPath: 'key' });
            }
        },
    });

    return dbInstance;
}

// --- Ventas -----------------------------------------------------------------

export async function guardarVentaLocal(venta: VentaLocal): Promise<void> {
    const db = await getDb();
    await db.put('ventas', venta);
}

export async function obtenerVentasPendientes(): Promise<VentaLocal[]> {
    const db = await getDb();
    const todas = await db.getAll('ventas');
    return todas.filter((v) => !v.is_synced);
}

export async function marcarVentasComoSincronizadas(ids: string[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('ventas', 'readwrite');
    for (const id of ids) {
        const venta = await tx.store.get(id);
        if (venta) {
            venta.is_synced = true;
            await tx.store.put(venta);
        }
    }
    await tx.done;
}

export async function incrementarIntentosSync(ids: string[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('ventas', 'readwrite');
    for (const id of ids) {
        const venta = await tx.store.get(id);
        if (venta) {
            venta.sync_attempts += 1;
            await tx.store.put(venta);
        }
    }
    await tx.done;
}

// --- Correlativo local de orden (funciona 100% offline) ---------------------
// Se usa para el ticket impreso mientras no hay número de orden del servidor.

export async function obtenerSiguienteNumeroOrdenLocal(): Promise<number> {
    const db = await getDb();
    const actual = await db.get('meta', 'contador_orden');
    const siguiente = (actual?.value ?? 0) + 1;
    await db.put('meta', { key: 'contador_orden', value: siguiente });
    return siguiente;
}

// --- Cache de productos y categorías (para operar sin red) -------------------

export async function guardarProductosCache(productos: ProductoCache[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('productos_cache', 'readwrite');
    for (const p of productos) {
        await tx.store.put(p);
    }
    await tx.done;
}

export async function obtenerProductosCache(): Promise<ProductoCache[]> {
    const db = await getDb();
    return db.getAll('productos_cache');
}

export async function guardarCategoriasCache(categorias: CategoriaCache[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('categorias_cache', 'readwrite');
    for (const c of categorias) {
        await tx.store.put(c);
    }
    await tx.done;
}

export async function obtenerCategoriasCache(): Promise<CategoriaCache[]> {
    const db = await getDb();
    const todas = await db.getAll('categorias_cache');
    return todas.filter((c) => c.activo).sort((a, b) => a.orden - b.orden);
}

// --- Utilidad: generación de UUIDv4 sin dependencias externas ----------------

export function generarUUID(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
